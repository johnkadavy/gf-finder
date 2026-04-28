import { normalizeCuisine } from "./cuisine";

/**
 * Rule-based cross-contamination risk prior derived from cuisine and place type.
 * Used as a fallback when the AI dossier lacks a CC signal, and as a sanity
 * check to prevent an AI "low" verdict on an inherently high-risk kitchen type.
 */
export function cuisineContamRisk(
  cuisine: string | null | undefined,
  placeTypes: string[] | null | undefined,
): "high" | "medium" | "low" {
  // place_type overrides take precedence — more specific than cuisine
  if (placeTypes?.length) {
    if (placeTypes.some((t) => ["bakery", "pizzeria", "deli"].includes(t))) return "high";
    if (placeTypes.includes("juice_bar"))                                    return "low";
  }

  const category = normalizeCuisine(cuisine ?? "");
  switch (category) {
    case "Italian":
    case "French":
      return "high";
    case "Steakhouse":
    case "Vegan / Vegetarian":
      return "low";
    default:
      return "medium";
  }
}

// Verified signals from scraping — takes precedence over AI-inferred dossier fields
export type VerifiedData = {
  menu?: {
    gf_labeling?: "clear" | "partial" | "none" | "unknown";
  };
};

// Scoring dossier — intentionally loose types (JSONB from Supabase may be partial)
export type ScoringDossier = {
  reviews?: {
    recent_sentiment?: "mostly_positive" | "mixed" | "mostly_negative" | "unknown";
    positive_count?: number;
    negative_count?: number;
    sick_reports_recent?: number;
    sick_reports_details?: Array<{ date?: string; summary?: string; source_url?: string }>;
    recency_coverage?: "good" | "fair" | "limited" | "poor" | "unknown";
  };
  menu?: {
    gf_labeling?: "clear" | "partial" | "none" | "unknown";
    gf_options_level?: "many" | "ample" | "moderate" | "few" | "limited" | "none" | "unknown";
    gf_substitutes?: { available?: boolean };
  };
  operations?: {
    staff_knowledge?: "high" | "medium" | "low" | "unknown";
    cross_contamination_risk?: "low" | "medium" | "high" | "unknown";
    dedicated_equipment?: {
      fryer?: boolean;
      prep_area?: "yes" | "no" | "dedicated" | "shared" | "unknown";
    };
    cc_signals?: {
      shared_equipment?: "yes" | "no" | "unknown";
      menu_disclaimer?: "warning" | "safe" | "none";
      menu_disclaimer_url?: string | null;
      staff_cc_awareness?: "high" | "low" | "unknown";
      signal?: "high" | "medium" | "low";
      evidence?: string;
    };
  };
  data_quality?: {
    confidence?: "high" | "medium" | "low";
  };
};

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Calculates a 0–100 safety score from a dossier.
 *
 * Weights:     Reviews 45% | Menu 35% | Operations 20%
 * Ops split:   Staff 70% | Cross-contam 30%
 * Recency:     good=1.0× | limited=0.85× | poor=0.55× | unknown=0.85×
 * Sick reports: −12 pts each (first 2), −18 pts each beyond, capped at −40
 * Positive momentum: +5 if pos≥10 & mostly_positive, +8 if pos≥20 & mostly_positive
 * Soft floor:  if solid signals across all categories, score ≥ 72
 * Confidence:  medium → ×0.95 + 50×0.05 | low → ×0.88 + 50×0.12
 */
export function calculateScore(
  dossier: ScoringDossier,
  verifiedData?: VerifiedData,
  context?: { cuisine?: string | null; placeTypes?: string[] | null },
): number | null {
  const r = dossier.reviews;
  const m = verifiedData?.menu ? { ...dossier.menu, ...verifiedData.menu } : dossier.menu;
  const o = dossier.operations;
  const dq = dossier.data_quality;

  // No meaningful data → no score
  if (!r && !m && !o) return null;

  // ── Reviews (45%) ──────────────────────────────────────────
  let sentimentBase: number;
  switch (r?.recent_sentiment) {
    case "mostly_positive": sentimentBase = 92; break;
    case "mixed":           sentimentBase = 70; break;
    case "mostly_negative": sentimentBase = 25; break;
    default:                sentimentBase = 65;
  }

  // Blend with positive/negative ratio when we have counts
  const pos = r?.positive_count ?? 0;
  const neg = r?.negative_count ?? 0;
  if (pos + neg > 0) {
    const ratioScore = (pos / (pos + neg)) * 100;
    sentimentBase = (sentimentBase + ratioScore) / 2;
  }

  // Positive momentum: reward proven real-world success
  if (r?.recent_sentiment === "mostly_positive") {
    if (pos >= 20)      sentimentBase += 8;
    else if (pos >= 10) sentimentBase += 5;
  }
  sentimentBase = clamp(sentimentBase, 0, 100);

  // Recency decay
  let recencyMult: number;
  switch (r?.recency_coverage) {
    case "good":    recencyMult = 1.0;  break;
    case "fair":
    case "limited": recencyMult = 0.85; break;  // "fair" from Airtable, "limited" from scoring schema
    case "poor":    recencyMult = 0.55; break;
    default:        recencyMult = 0.85; // unknown: assume roughly recent
  }

  // Sick report penalty: −12 per report (first 2), −18 beyond, cap at −40
  const sickCount = r?.sick_reports_recent ?? 0;
  const firstTwo = Math.min(sickCount, 2) * 12;
  const remainder = Math.max(sickCount - 2, 0) * 18;
  const sickPenalty = clamp(firstTwo + remainder, 0, 40);

  const reviewsScore = clamp(sentimentBase * recencyMult - sickPenalty, 0, 100);

  // ── Menu (35%) ─────────────────────────────────────────────
  let labelingScore: number;
  switch (m?.gf_labeling) {
    case "clear":   labelingScore = 100; break;
    case "partial": labelingScore = 60;  break;
    case "none":    labelingScore = 0;   break;
    default:        labelingScore = 50;  // unknown: neutral
  }

  let optionsScore: number;
  switch (m?.gf_options_level) {
    case "many":
    case "ample":    optionsScore = 100; break;  // "ample" from scoring schema, "many" legacy
    case "moderate": optionsScore = 75;  break;  // Airtable value
    case "few":
    case "limited":  optionsScore = 35;  break;  // "limited" from Airtable, "few" from scoring schema
    case "none":     optionsScore = 0;   break;
    default:         optionsScore = 50;  // unknown: neutral
  }

  let menuScore = labelingScore * 0.6 + optionsScore * 0.4;
  if (m?.gf_substitutes?.available === true) menuScore += 5;
  menuScore = clamp(menuScore, 0, 100);

  // ── Operations (20%) ───────────────────────────────────────
  // Staff is more actionable + differentiating → 70% weight
  // Cross-contamination is often generic → 30% weight
  let staffScore: number;
  switch (o?.staff_knowledge) {
    case "high":   staffScore = 100; break;
    case "medium": staffScore = 65;  break;
    case "low":    staffScore = 20;  break;
    default:       staffScore = 60;  // unknown: neutral
  }

  const cuisinePrior = cuisineContamRisk(context?.cuisine, context?.placeTypes);

  // Priority: focused cc_signals → broad AI cross_contamination_risk → cuisine prior
  let contamScore: number;
  const ccSignal = o?.cc_signals?.signal;
  const aiRisk = o?.cross_contamination_risk;

  if (ccSignal) {
    switch (ccSignal) {
      case "high":   contamScore = 40;  break;
      case "medium": contamScore = 75;  break;
      case "low":    contamScore = 100; break;
    }
    // Cuisine prior as sanity check: can't be "low" for an inherently high-risk kitchen
    if (ccSignal === "low" && cuisinePrior === "high") contamScore = 75;
  } else if (!aiRisk || aiRisk === "unknown") {
    // No AI signal at all — fall back to cuisine prior
    switch (cuisinePrior) {
      case "high":   contamScore = 40;  break;
      case "medium": contamScore = 70;  break;
      case "low":    contamScore = 100; break;
    }
  } else if (aiRisk === "low" && cuisinePrior === "high") {
    // Broad AI says safe but cuisine is inherently high-risk — pull back to medium
    contamScore = 75;
  } else {
    switch (aiRisk) {
      case "low":    contamScore = 100; break;
      case "medium": contamScore = 75;  break;
      case "high":   contamScore = 40;  break;
      default:       contamScore = 70;
    }
  }

  let opsScore = staffScore * 0.7 + contamScore * 0.3;
  if (o?.dedicated_equipment?.fryer === true)        opsScore += 8;
  else if (o?.dedicated_equipment?.fryer === false)  opsScore -= 5;
  if (o?.dedicated_equipment?.prep_area === "yes" || o?.dedicated_equipment?.prep_area === "dedicated")  opsScore += 7;  // "dedicated" from Airtable, "yes" from scoring schema
  opsScore = clamp(opsScore, 0, 100);

  // ── Combine ────────────────────────────────────────────────
  let rawScore = reviewsScore * 0.45 + menuScore * 0.35 + opsScore * 0.2;

  // Soft floor: solid restaurants shouldn't fall below 72 due to generic unknowns
  const isSolid =
    r?.recent_sentiment === "mostly_positive" &&
    (m?.gf_options_level === "many" || m?.gf_options_level === "ample") &&
    (m?.gf_labeling === "clear" || m?.gf_labeling === "partial") &&
    (r?.sick_reports_recent ?? 0) === 0;
  if (isSolid) rawScore = Math.max(rawScore, 72);

  // Confidence nudges score toward 50 — but gently
  if      (dq?.confidence === "low")    rawScore = rawScore * 0.88 + 50 * 0.12;
  else if (dq?.confidence === "medium") rawScore = rawScore * 0.95 + 50 * 0.05;

  return Math.round(clamp(rawScore, 0, 100));
}

export function getScoreLabel(score: number | null): { label: string; color: string } {
  if (score === null) return { label: "No Data",              color: "#9AA5BE" };
  if (score >= 85)    return { label: "Excellent",            color: "#4A7C59" };
  if (score >= 75)    return { label: "Great Option",         color: "#576A8F" };
  if (score >= 65)    return { label: "Good Option",          color: "#6B78C5" };
  if (score >= 55)    return { label: "Ask Questions",        color: "#8B7BC5" };
  if (score >= 40)    return { label: "Limited / Inconsistent", color: "#C5A04A" };
  return                     { label: "High Risk",            color: "#FF7444" };
}

export function getGaugeColor(score: number | null): string {
  if (score === null) return "#C5C8D6";
  if (score >= 85)    return "#4A7C59";
  if (score >= 75)    return "#576A8F";
  if (score >= 65)    return "#6B78C5";
  if (score >= 55)    return "#8B7BC5";
  if (score >= 40)    return "#C5A04A";
  return "#FF7444";
}

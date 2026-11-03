import { normalizeCuisine } from "./cuisine";
import { SCORE_COLORS } from "./tokens";

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
      staff_cc_awareness?: "high" | "low" | "unknown";
      signal?: "high" | "medium" | "low";
      evidence?: string;
    };
  };
  data_quality?: {
    confidence?: "high" | "medium" | "low";
  };
};

/**
 * Kitchen practices a restaurant reported through the submission form, as
 * stored on `restaurants.reported_protocol` once an admin approves it
 * (codes from lib/tally.ts). Only the fields below affect the score; the rest
 * of the stored object is display-only.
 *
 * Rules (PRIORITIES.md item A):
 * - "not_sure" / missing → no effect.
 * - Admissions against interest (shared fryer, shared prep, shared equipment,
 *   no training, menu not marked) count fully and override the dossier.
 * - Positive claims count at REPORTED_CLAIM_WEIGHT, and only where the dossier
 *   has no evidence of its own — they never override what reviews found.
 * - Reporting never changes data_quality.confidence.
 */
export type ReportedProtocol = {
  kitchen?: {
    fully_gf?: string | null;
    fryer?: string | null;
    prep?: string | null;
    shared_with_gluten?: string[];
  };
  order_handling?: { steps?: string[] };
  staff?: { trained?: string | null; who?: string | null; frequency?: string | null };
  menu?: { marking?: string | null };
};

/** Discount on uncorroborated positive self-reports. */
export const REPORTED_CLAIM_WEIGHT = 0.5;

/** Move `current` toward `target` by the claim discount; never moves it down. */
function creditClaim(current: number, target: number) {
  return target > current ? current + (target - current) * REPORTED_CLAIM_WEIGHT : current;
}

/** Shared-equipment items the restaurant admitted to (drops "none" / "not_sure"). */
export function reportedSharedItems(rp: ReportedProtocol | null | undefined): string[] {
  return (rp?.kitchen?.shared_with_gluten ?? []).filter((x) => x !== "none" && x !== "not_sure");
}

/**
 * Date the scoring model last changed every restaurant's score. Bump this
 * whenever you run `backfill-scores.ts --all --write` after editing this file —
 * the sitemap uses it as a lastModified floor so Google re-crawls stale snippets.
 */
export const SCORING_MODEL_UPDATED_AT = "2026-10-27";

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
 * Reported:    restaurant-reported practices adjust menu labeling, staff,
 *              cross-contam and equipment — see ReportedProtocol for the rules
 */
export function calculateScore(
  dossier: ScoringDossier,
  context?: { cuisine?: string | null; placeTypes?: string[] | null; reported?: ReportedProtocol | null },
): number | null {
  const r = dossier.reviews;
  const m = dossier.menu;
  const o = dossier.operations;
  const dq = dossier.data_quality;
  const rp = context?.reported;

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
  const marking = rp?.menu?.marking;
  if (marking === "not_marked") labelingScore = 0;
  else if ((marking === "labeled" || marking === "separate_menu") && (!m?.gf_labeling || m.gf_labeling === "unknown")) {
    labelingScore = creditClaim(labelingScore, 100);
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
  const staff = rp?.staff;
  if (staff?.trained === "no") {
    staffScore = Math.min(staffScore, 65);
  } else if (staff?.trained === "yes" && (!o?.staff_knowledge || o.staff_knowledge === "unknown")) {
    const regular = staff.frequency === "yearly" || staff.frequency === "more_than_yearly";
    const target = staff.who === "all_foh" ? (regular ? 100 : 85) : staff.who === "some_foh" ? 75 : null;
    if (target !== null) staffScore = creditClaim(staffScore, target);
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
      default:       contamScore = 70;  // "unknown" or unexpected value → neutral
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

  // Reported kitchen practices: admitted shared equipment caps cross-contam;
  // claimed separation only fills in when the dossier has no CC evidence.
  const k = rp?.kitchen;
  const shared = reportedSharedItems(rp);
  if (shared.length >= 3) contamScore = Math.min(contamScore, 40);
  else if (shared.length > 0) contamScore = Math.min(contamScore, 75);
  if (rp?.order_handling?.steps?.includes("none")) contamScore = Math.min(contamScore, 75);

  const reportedFullyGf =
    k?.fully_gf === "yes" && shared.length === 0 && k.fryer !== "shared" && k.prep !== "shared";
  const dossierHasCcEvidence = !!ccSignal || (!!aiRisk && aiRisk !== "unknown");
  if (!dossierHasCcEvidence) {
    if (reportedFullyGf) contamScore = creditClaim(contamScore, 100);
    else if (k?.shared_with_gluten?.includes("none") && (k.prep === "separate_area" || k.prep === "separate_tools")) {
      contamScore = creditClaim(contamScore, 90);
    }
  }

  let opsScore = staffScore * 0.7 + contamScore * 0.3;

  const dossierFryer = o?.dedicated_equipment?.fryer;
  if (k?.fryer === "shared")                         opsScore -= 5;
  else if (dossierFryer === true)                    opsScore += 8;
  else if (dossierFryer === false)                   opsScore -= 5;
  else if (k?.fryer === "dedicated")                 opsScore += 8 * REPORTED_CLAIM_WEIGHT;

  const dossierPrep = o?.dedicated_equipment?.prep_area;
  if (k?.prep === "shared") {
    // admitted shared prep: no bonus, whatever the dossier says
  } else if (dossierPrep === "yes" || dossierPrep === "dedicated") {
    opsScore += 7;  // "dedicated" from Airtable, "yes" from scoring schema
  } else if ((!dossierPrep || dossierPrep === "unknown") && (k?.prep === "separate_area" || reportedFullyGf)) {
    opsScore += 7 * REPORTED_CLAIM_WEIGHT;
  }
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
  if (score === null) return { label: "No Data",                color: SCORE_COLORS.noData    };
  if (score >= 85)    return { label: "Excellent",              color: SCORE_COLORS.excellent };
  if (score >= 75)    return { label: "Great Option",           color: SCORE_COLORS.great     };
  if (score >= 65)    return { label: "Good Option",            color: SCORE_COLORS.good      };
  if (score >= 55)    return { label: "Ask Questions",          color: SCORE_COLORS.caution   };
  if (score >= 40)    return { label: "Limited / Inconsistent", color: SCORE_COLORS.limited   };
  return                     { label: "High Risk",              color: SCORE_COLORS.risk      };
}

export function getGaugeColor(score: number | null): string {
  if (score === null) return SCORE_COLORS.noData;
  if (score >= 85)    return SCORE_COLORS.excellent;
  if (score >= 75)    return SCORE_COLORS.great;
  if (score >= 65)    return SCORE_COLORS.good;
  if (score >= 55)    return SCORE_COLORS.caution;
  if (score >= 40)    return SCORE_COLORS.limited;
  return SCORE_COLORS.risk;
}

/**
 * The one way to score a restaurant row. Stored `restaurants.score` and every
 * live display must go through this so they agree — it always passes the
 * cuisine / place-type context that calculateScore uses for its
 * cross-contamination prior, and any approved restaurant-reported practices.
 * Select at least the SCORE_INPUT_COLUMNS (lib/rescore.ts) so none are
 * missed. See lib/rescore.ts for keeping the stored column fresh after writes.
 */
export function scoreRestaurant(r: {
  dossier?: unknown;
  cuisine?: string | null;
  place_type?: string[] | null;
  reported_protocol?: unknown;
}): number | null {
  if (!r.dossier) return null;
  return calculateScore(
    r.dossier as ScoringDossier,
    {
      cuisine: r.cuisine ?? null,
      placeTypes: r.place_type ?? null,
      reported: (r.reported_protocol as ReportedProtocol | null) ?? null,
    },
  );
}

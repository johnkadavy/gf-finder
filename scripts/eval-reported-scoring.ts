/**
 * Checks the restaurant-reported scoring rules in lib/score.ts
 * (PRIORITIES.md item A). Run after changing calculateScore:
 *
 *   npx tsx scripts/eval-reported-scoring.ts
 *
 * Exits non-zero if any rule is violated.
 */

import { calculateScore, type ReportedProtocol, type ScoringDossier } from "../lib/score";

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}  (${detail})`);
  if (!ok) failures++;
}

// A thin dossier: reviews say something, ops know nothing.
const thin: ScoringDossier = {
  reviews: { recent_sentiment: "mixed", positive_count: 3, negative_count: 1, recency_coverage: "fair" },
  menu: { gf_labeling: "unknown", gf_options_level: "moderate" },
  data_quality: { confidence: "medium" },
};

// A dossier with negative evidence from reviews.
const evidenced: ScoringDossier = {
  ...thin,
  menu: { gf_labeling: "none", gf_options_level: "moderate" },
  operations: {
    staff_knowledge: "low",
    cross_contamination_risk: "high",
    dedicated_equipment: { fryer: false, prep_area: "shared" },
  },
};

const ctx = { cuisine: "American", placeTypes: null };
const score = (d: ScoringDossier, reported?: ReportedProtocol) => calculateScore(d, { ...ctx, reported })!;

const allPositive: ReportedProtocol = {
  kitchen: { fully_gf: "yes", fryer: "dedicated", prep: "separate_area", shared_with_gluten: [] },
  order_handling: { steps: ["ticket_flag", "surfaces_cleaned", "glove_change"] },
  staff: { trained: "yes", who: "all_foh", frequency: "yearly" },
  menu: { marking: "labeled" },
};

const allNotSure: ReportedProtocol = {
  kitchen: { fully_gf: "not_sure", fryer: "not_sure", prep: "not_sure", shared_with_gluten: ["not_sure"] },
  staff: { trained: "not_sure" },
};

const admissions: ReportedProtocol = {
  kitchen: { fully_gf: "no", fryer: "shared", prep: "shared", shared_with_gluten: ["grill", "toaster", "pasta_water"] },
  staff: { trained: "no" },
  menu: { marking: "not_marked" },
};

const base = score(thin);

check("No report = unchanged", score(thin, {}) === base, `${score(thin, {})} vs ${base}`);
check("\"Not sure\" everywhere = unchanged", score(thin, allNotSure) === base, `${score(thin, allNotSure)} vs ${base}`);

const pos = score(thin, allPositive);
check("Positive claims raise a thin dossier", pos > base, `${base} → ${pos}`);

// Full credit = what the same answers would score if reviews had found them.
const corroborated = score({
  ...thin,
  menu: { ...thin.menu, gf_labeling: "clear" },
  operations: {
    staff_knowledge: "high",
    cross_contamination_risk: "low",
    dedicated_equipment: { fryer: true, prep_area: "dedicated" },
  },
});
check("Positive claims are discounted vs. corroborated evidence", pos < corroborated, `reported ${pos} < corroborated ${corroborated}`);

const ev = score(evidenced);
check("Positive claims never override negative evidence", score(evidenced, allPositive) === ev, `${score(evidenced, allPositive)} vs ${ev}`);

const adm = score(thin, admissions);
check("Admissions against interest lower the score", adm < base, `${base} → ${adm}`);

const evidencedPositive: ScoringDossier = {
  ...thin,
  menu: { gf_labeling: "clear", gf_options_level: "moderate" },
  operations: {
    staff_knowledge: "high",
    cross_contamination_risk: "low",
    dedicated_equipment: { fryer: true, prep_area: "dedicated" },
  },
};
check(
  "Admissions override positive dossier evidence",
  score(evidencedPositive, admissions) < score(evidencedPositive),
  `${score(evidencedPositive)} → ${score(evidencedPositive, admissions)}`,
);

const contradictory: ReportedProtocol = {
  kitchen: { fully_gf: "yes", fryer: "dedicated", prep: "separate_area", shared_with_gluten: ["grill", "toaster"] },
};
const fullyGfOnly: ReportedProtocol = {
  kitchen: { fully_gf: "yes", fryer: "dedicated", prep: "separate_area", shared_with_gluten: [] },
};
check(
  "Fully-GF claim earns nothing when shared equipment is admitted",
  score(thin, contradictory) < score(thin, fullyGfOnly),
  `${score(thin, contradictory)} < ${score(thin, fullyGfOnly)}`,
);

const lowConf: ScoringDossier = { ...thin, data_quality: { confidence: "low" } };
const highConf: ScoringDossier = { ...thin, data_quality: { confidence: "high" } };
check(
  "Reporting doesn't change the confidence nudge",
  score(lowConf, allPositive) - score(lowConf) < score(highConf, allPositive) - score(highConf),
  `low-conf gain ${score(lowConf, allPositive) - score(lowConf)}, high-conf gain ${score(highConf, allPositive) - score(highConf)}`,
);

const swing = Math.max(pos - base, base - adm);
check("Total swing from a report stays modest (≤ 15 pts)", swing <= 15, `max swing ${swing}`);

console.log(failures ? `\n${failures} failed` : "\nAll passed");
process.exit(failures ? 1 : 0);

import { z } from "zod";

export const DossierSchema = z.object({
  restaurant: z.object({
    name: z.string(),
    location: z.string(),
    cuisine: z.string(),
  }),
  summary: z.object({
    gf_experience_level: z.enum(["Strong", "Mixed", "Poor", "Unknown"]),
    short_summary: z.string(),
  }),
  reviews: z.object({
    recent_sentiment: z.enum([
      "mostly_positive",
      "mixed",
      "mostly_negative",
      "unknown",
    ]),
    positive_count: z.number(),
    negative_count: z.number(),
    sick_reports_recent: z.number(),
    sick_reports_details: z.array(
      z.object({
        date: z.string(),
        summary: z.string(),
      })
    ),
    recency_coverage: z.enum(["good", "limited", "poor", "unknown"]),
  }),
  menu: z.object({
    gf_labeling: z.enum(["clear", "partial", "none", "unknown"]),
    gf_options_level: z.enum(["many", "ample", "few", "none", "unknown"]),
    gf_options_detail: z.object({
      apps: z.boolean(),
      entrees: z.boolean(),
      desserts: z.boolean(),
    }),
    gf_substitutes: z.object({
      available: z.boolean(),
      details: z.array(z.string()),
    }),
    notes: z.string(),
  }),
  operations: z.object({
    staff_knowledge: z.enum(["high", "medium", "low", "unknown"]),
    cross_contamination_risk: z.enum(["low", "medium", "high", "unknown"]),
    dedicated_equipment: z.object({
      fryer: z.boolean(),
      prep_area: z.enum(["yes", "no", "unknown"]),
    }),
  }),
  data_quality: z.object({
    review_count: z.number(),
    menu_found: z.boolean(),
    confidence: z.enum(["high", "medium", "low"]),
    last_updated: z.string(),
  }),
});

export type Dossier = z.infer<typeof DossierSchema>;

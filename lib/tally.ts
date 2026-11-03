/**
 * Tally webhook parsing for the restaurant kitchen-practices form
 * (PRIORITIES.md item A).
 *
 * Questions are matched by label prefix and answers by option text, then
 * normalized into stable codes. If a label or option is edited in Tally,
 * update the tables below and bump PROTOCOL_SCHEMA_VERSION (lib/invites.ts)
 * when the meaning changes. Anything unmatched lands in `unmapped` and the raw
 * payload is always stored, so nothing is lost.
 */
import { createHmac, timingSafeEqual } from "crypto";

// ── Payload types ───────────────────────────────────────────

type TallyOption = { id: string; text: string };
export type TallyFile = { id?: string; name: string; url: string; mimeType?: string; size?: number };

export type TallyField = {
  key: string;
  label: string;
  type: string;
  value: unknown;
  options?: TallyOption[];
};

export type TallyPayload = {
  eventId: string;
  eventType: string;
  createdAt: string;
  data: {
    responseId: string;
    submissionId?: string;
    formId: string;
    formName?: string;
    createdAt: string;
    fields: TallyField[];
  };
};

/** Tally signs the raw body: base64(HMAC-SHA256(secret, body)) in `tally-signature`. */
export function verifyTallySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── Field access ────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Checkbox groups also arrive as one boolean field per option (label
 * "Question (Option)"); only the group field carries `options`, so prefer it.
 */
function findField(fields: TallyField[], labelPrefix: string): TallyField | undefined {
  const p = norm(labelPrefix);
  const matches = fields.filter((f) => norm(f.label ?? "").startsWith(p));
  return matches.find((f) => f.options) ?? matches[0];
}

export function hiddenField(fields: TallyField[], name: string): string | null {
  const f = fields.find((x) => x.type === "HIDDEN_FIELDS" && x.label === name);
  return typeof f?.value === "string" && f.value !== "" ? f.value : null;
}

function text(fields: TallyField[], label: string): string | null {
  const v = findField(fields, label)?.value;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** Selected option texts for a multiple-choice or checkbox question. */
function selected(fields: TallyField[], label: string): string[] {
  const f = findField(fields, label);
  if (!f || !Array.isArray(f.value)) return [];
  const byId = new Map((f.options ?? []).map((o) => [o.id, o.text]));
  return (f.value as unknown[])
    .map((v) => (typeof v === "string" ? byId.get(v) ?? v : null))
    .filter((v): v is string => !!v)
    .map((v) => v.trim());
}

function files(fields: TallyField[], label: string): TallyFile[] {
  const v = findField(fields, label)?.value;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is TallyFile => !!x && typeof x === "object" && typeof (x as TallyFile).url === "string");
}

// ── Option text → code tables ───────────────────────────────

type CodeMap = Record<string, string>;

const YES_NO: CodeMap = { "yes": "yes", "no": "no", "not sure": "not_sure" };

const FRYER: CodeMap = {
  "yes, a dedicated gluten-free fryer": "dedicated",
  "no, the fryer is shared with gluten items": "shared",
  "we don't fry gluten-free items": "no_fried_gf",
  "not sure": "not_sure",
};

const PREP: CodeMap = {
  "a separate gluten-free prep area": "separate_area",
  "the same area, with separate boards and tools": "separate_tools",
  "shared, no separation": "shared",
  "not sure": "not_sure",
};

const SHARED_WITH_GLUTEN: CodeMap = {
  "pasta water": "pasta_water",
  "grill or flat-top": "grill",
  "toaster": "toaster",
  "pizza oven": "pizza_oven",
  "prep surfaces": "prep_surfaces",
  "none of these": "none",
  "not sure": "not_sure",
};

const DESSERTS_SOURCE: CodeMap = {
  "made in-house in a shared kitchen": "in_house_shared",
  "made in-house in a separate space": "in_house_separate",
  "bought in sealed packaging": "sealed",
  "we don't offer them": "none",
};

const ORDER_STEPS: CodeMap = {
  "ticket is flagged": "ticket_flag",
  "shared surfaces are cleaned": "surfaces_cleaned",
  "cooks change gloves": "glove_change",
  "clean or separate utensils are used": "separate_utensils",
  "chef or manager handles it": "chef_handles",
  "separate plating or runner": "separate_runner",
  "none of these": "none",
};

const TAKEOUT: CodeMap = {
  "yes": "yes",
  "no": "no",
  "not sure": "not_sure",
  "we don't do takeout or delivery": "no_takeout",
};

const TRAINED_WHO: CodeMap = {
  "all front-of-house staff": "all_foh",
  "some front-of-house staff": "some_foh",
  "kitchen staff only": "kitchen_only",
};

const TRAINING_FREQ: CodeMap = {
  "when hired only": "at_hire",
  "once a year": "yearly",
  "more than once a year": "more_than_yearly",
};

const MENU_MARKING: CodeMap = {
  "gluten-free items are labeled": "labeled",
  "we have a separate gluten-free menu": "separate_menu",
  "not marked": "not_marked",
};

// ── Normalized answers (schema v1) ──────────────────────────

export type ProtocolAnswers = {
  contact: { name: string | null; role: string | null; email: string | null; phone: string | null };
  kitchen: {
    fully_gf: string | null;
    fryer: string | null;
    prep: string | null;
    shared_with_gluten: string[];
    separation_notes: string | null;
  };
  /** Display-only GF options, kept as the option text shown to diners. */
  gf_options: {
    bread: string[];
    sauces: string[];
    breakfast: string[];
    beverages: string[];
    fried: string[];
    desserts_source: string | null;
  };
  order_handling: { steps: string[]; walkthrough: string | null; takeout_packed: string | null };
  staff: { trained: string | null; who: string | null; frequency: string | null; training_notes: string | null };
  menu: { marking: string | null; proudest_dishes: string | null; menu_link: string | null; menu_files: TallyFile[] };
  links: {
    website: string | null;
    guest_phone: string | null;
    reservations: string | null;
    ordering: string[];
    instagram: string | null;
    page_corrections: string | null;
  };
  attest: { accurate: boolean; publish: boolean };
  /** Option texts we had no code for, by question — fix the tables above. */
  unmapped: Record<string, string[]>;
};

/** Drop "None of the below" so display lists only hold real options. */
const realOptions = (opts: string[]) => opts.filter((o) => norm(o) !== "none of the below");

export function parseProtocolAnswers(fields: TallyField[]): ProtocolAnswers {
  const unmapped: Record<string, string[]> = {};

  const one = (label: string, map: CodeMap): string | null => {
    const [first] = selected(fields, label);
    if (!first) return null;
    const code = map[norm(first)];
    if (!code) (unmapped[label] ??= []).push(first);
    return code ?? null;
  };
  const many = (label: string, map: CodeMap): string[] =>
    selected(fields, label).flatMap((t) => {
      const code = map[norm(t)];
      if (!code) (unmapped[label] ??= []).push(t);
      return code ? [code] : [];
    });

  // The sign-off checkboxes have no question title of their own, so look for
  // their option text in any selected field rather than by label.
  const allSelected = fields.flatMap((f) => (f.options ? selected([f], f.label ?? "") : []));
  const attestedAccurate = allSelected.some((t) => norm(t).startsWith("i work at"));
  const attestedPublish = allSelected.some((t) => norm(t).startsWith("cleanplate may publish"));

  return {
    contact: {
      name: text(fields, "Your name"),
      role: text(fields, "Your role"),
      email: text(fields, "Best email to reach you"),
      phone: text(fields, "Best phone number"),
    },
    kitchen: {
      fully_gf: one("Is your kitchen entirely gluten-free?", YES_NO),
      fryer: one("Do you have a dedicated fryer", FRYER),
      prep: one("Where are gluten-free dishes prepared?", PREP),
      shared_with_gluten: many("Which of these are shared between gluten", SHARED_WITH_GLUTEN),
      separation_notes: text(fields, "Anything else about how you keep gluten-free food separate?"),
    },
    gf_options: {
      bread: realOptions(selected(fields, "Do you serve gluten-free bread")),
      sauces: realOptions(selected(fields, "Do you serve gluten-free sauces")),
      breakfast: realOptions(selected(fields, "Do you serve gluten-free breakfast")),
      beverages: realOptions(selected(fields, "Do you serve gluten-free beverages")),
      fried: realOptions(selected(fields, "Fried items")),
      desserts_source: one("Gluten-free desserts and baked goods are", DESSERTS_SOURCE),
    },
    order_handling: {
      steps: many("When an order is flagged gluten-free or celiac", ORDER_STEPS),
      walkthrough: text(fields, "Walk us through what happens when a guest tells you"),
      takeout_packed: one("For takeout and delivery", TAKEOUT),
    },
    staff: {
      trained: one("Do you train staff on allergen handling?", YES_NO),
      who: one("Who is trained?", TRAINED_WHO),
      frequency: one("How often?", TRAINING_FREQ),
      training_notes: text(fields, "What does the training cover"),
    },
    menu: {
      marking: one("How are gluten-free items marked on your menu?", MENU_MARKING),
      proudest_dishes: text(fields, "Which gluten-free dishes are you proudest of?"),
      menu_link: text(fields, "Or link to your menu"),
      menu_files: files(fields, "Upload your current menu"),
    },
    links: {
      website: text(fields, "Website"),
      guest_phone: text(fields, "Phone number for guests"),
      reservations: text(fields, "Reservations link"),
      ordering: (text(fields, "Online ordering or delivery app links") ?? "")
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter((s) => /^https?:\/\//i.test(s)),
      instagram: text(fields, "Instagram handle")?.replace(/^@/, "") ?? null,
      page_corrections: text(fields, "Is anything else on your CleanPlate page wrong?"),
    },
    attest: { accurate: attestedAccurate, publish: attestedPublish },
    unmapped,
  };
}

/**
 * Turning an approved restaurant submission into listing data
 * (PRIORITIES.md item A).
 *
 * `restaurants` is publicly readable, so only what the restaurant agreed we
 * may publish goes on it — never the contact block. The full answers stay on
 * `restaurant_submissions`.
 *
 * Relative imports only: also used by scripts/ run via tsx.
 */
import { normalizeOrderProvider, type OrderLink } from "./order-links";
import { reportedSharedItems, type ReportedProtocol, type ScoringDossier } from "./score";
import type { ProtocolAnswers } from "./tally";

/** Stored on `restaurants.reported_protocol`. Scoring reads the ReportedProtocol subset. */
export type StoredReportedProtocol = ReportedProtocol & {
  submission_id: string;
  schema_version: number;
  kitchen: ProtocolAnswers["kitchen"];
  gf_options: ProtocolAnswers["gf_options"];
  order_handling: ProtocolAnswers["order_handling"];
  staff: ProtocolAnswers["staff"];
  menu: Omit<ProtocolAnswers["menu"], "menu_files">;
};

/** Stored on `restaurants.reported_links`; preferred over pipeline links on the page. */
export type ReportedLinks = {
  website: string | null;
  phone: string | null;
  reservations: string | null;
  /** In the order the restaurant listed them. */
  ordering: OrderLink[];
  instagram: string | null;
};

export function toReportedProtocol(answers: ProtocolAnswers, submissionId: string, schemaVersion: number): StoredReportedProtocol {
  const { menu_files: _files, ...menu } = answers.menu;
  return {
    submission_id: submissionId,
    schema_version: schemaVersion,
    kitchen: answers.kitchen,
    gf_options: answers.gf_options,
    order_handling: answers.order_handling,
    staff: answers.staff,
    menu,
  };
}

export function toReportedLinks(answers: ProtocolAnswers): ReportedLinks | null {
  const l = answers.links;
  const seen = new Set<string>();
  const ordering = l.ordering
    .filter((url) => !seen.has(url) && seen.add(url))
    .map((url) => ({ provider: normalizeOrderProvider(url), url }));
  const links: ReportedLinks = {
    website: l.website,
    phone: l.guest_phone,
    reservations: l.reservations,
    ordering,
    instagram: l.instagram,
  };
  const empty = !links.website && !links.phone && !links.reservations && !ordering.length && !links.instagram;
  return empty ? null : links;
}

/** Read `restaurants.reported_links` defensively — it's jsonb. */
export function parseReportedLinks(raw: unknown): ReportedLinks | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<ReportedLinks>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const ordering = Array.isArray(r.ordering)
    ? r.ordering.filter((o): o is OrderLink => !!o && typeof o.url === "string" && /^https?:\/\//.test(o.url))
    : [];
  return {
    website: str(r.website),
    phone: str(r.phone),
    reservations: str(r.reservations),
    ordering,
    instagram: str(r.instagram),
  };
}

/**
 * Things a reviewer should look at before approving: answers that contradict
 * each other, or contradict what the dossier found.
 */
export function protocolFlags(a: ProtocolAnswers, dossier: ScoringDossier | null): string[] {
  const flags: string[] = [];
  const k = a.kitchen;
  const shared = reportedSharedItems({ kitchen: k });
  const o = dossier?.operations;

  if (k.fully_gf === "yes") {
    if (shared.length) flags.push(`Says the kitchen is fully gluten-free but shares: ${shared.join(", ")}.`);
    if (k.fryer === "shared") flags.push("Says the kitchen is fully gluten-free but the fryer is shared with gluten.");
    if (k.prep === "shared") flags.push("Says the kitchen is fully gluten-free but prep is shared.");
    if ((dossier?.reviews?.sick_reports_recent ?? 0) > 0) {
      flags.push(`Says fully gluten-free, but the dossier has ${dossier!.reviews!.sick_reports_recent} recent illness report(s).`);
    }
  }
  if (k.shared_with_gluten.includes("none") && shared.length) flags.push("Picked \"None of these\" alongside shared items.");
  if (k.fryer === "dedicated" && o?.dedicated_equipment?.fryer === false) flags.push("Claims a dedicated fryer; the dossier says shared.");
  if ((k.prep === "separate_area" || k.fully_gf === "yes") &&
      (o?.dedicated_equipment?.prep_area === "no" || o?.dedicated_equipment?.prep_area === "shared")) {
    flags.push("Claims separate prep; the dossier says shared.");
  }
  const cc = o?.cc_signals?.signal ?? o?.cross_contamination_risk;
  if (cc === "high" && (k.fully_gf === "yes" || k.shared_with_gluten.includes("none"))) {
    flags.push("Claims little or no shared equipment; the dossier rates cross-contamination risk high.");
  }

  if (a.order_handling.steps.includes("none") && a.order_handling.steps.length > 1) flags.push("Picked \"None of these\" alongside order-handling steps.");
  if (a.staff.trained === "yes" && (!a.staff.who || !a.staff.frequency)) flags.push("Says staff are trained but left who/how often blank.");
  if (a.staff.trained === "no" && (a.staff.who || a.staff.frequency)) flags.push("Says staff aren't trained but filled in who/how often.");
  if (a.staff.trained === "yes" && o?.staff_knowledge === "low") flags.push("Says staff are trained; reviews rate staff knowledge low.");
  if ((a.menu.marking === "labeled" || a.menu.marking === "separate_menu") && dossier?.menu?.gf_labeling === "none") {
    flags.push("Says GF items are marked; the dossier found no labeling.");
  }
  if (a.menu.marking === "not_marked" && (dossier?.menu?.gf_labeling === "clear" || dossier?.menu?.gf_labeling === "partial")) {
    flags.push(`Says GF items aren't marked; the dossier found ${dossier.menu.gf_labeling} labeling — approving drops menu labeling to none.`);
  }

  if (!a.attest.accurate || !a.attest.publish) flags.push("Sign-off incomplete — missing one or both attestations.");
  if (Object.keys(a.unmapped).length) flags.push(`Unmapped options: ${JSON.stringify(a.unmapped)}`);
  return flags;
}

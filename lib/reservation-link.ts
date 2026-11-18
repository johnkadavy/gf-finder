/**
 * Validates the Airtable reservation_link AI field before it reaches
 * `restaurants.reservation_link`, which the restaurant page renders as a
 * "Reserve" button. Rejects prose ("Nothing found.", "NONE", explanations)
 * and online-ordering / delivery / listing links the model returns when a
 * place has no reservations.
 *
 * Relative imports only: also used by scripts/ run via tsx.
 */
import { aiAnswerLine } from "./ai-json";

// Hosts (or parent domains) that are ordering, delivery, social or listing
// pages — never a table booking.
const BLOCKED_HOSTS = [
  "toasttab.com", // online ordering; tables.toasttab.com / book.toasttab.com are allowed below
  "toast.app",
  "wonder.com",
  "getsauce.com",
  "chowbus.com",
  "orders.co",
  "chownow.com",
  "skytab.com",
  "grubhub.com",
  "seamless.com",
  "ubereats.com",
  "slicelife.com",
  "menufy.com",
  "square.site",
  "instagram.com",
  "facebook.com",
  "linktr.ee",
  "google.com",
  "goo.gl",
];

// Subdomains of blocked hosts that are real booking pages.
const ALLOWED_HOSTS = ["tables.toasttab.com", "book.toasttab.com"];

// Hosts that are only a booking link on their reservations path.
const RESERVATIONS_PATH_ONLY = ["yelp.com", "doordash.com"];

const ORDERING_PATH = /(^|\/)(order|ordering|online-?ordering|order-?online)(\/|$)/i;

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export type ReservationPolicy = "online" | "walk_in" | "phone";

/** Matches the restaurants.reservation_policy check constraint. */
export interface ParsedReservation {
  link: string | null;
  policy: ReservationPolicy | null;
}


/**
 * Turn the reservation_link AI field (last line: a URL, WALK_IN, PHONE or NONE)
 * into the two stored columns. Anything unrecognised is treated as NONE.
 */
export function parseReservation(raw: string | null | undefined): ParsedReservation {
  const answer = aiAnswerLine(raw);
  const token = answer?.toUpperCase().replace(/[\s-]+/g, "_");
  if (token === "WALK_IN" || token === "WALK_INS" || token === "WALK_IN_ONLY") return { link: null, policy: "walk_in" };
  if (token === "PHONE" || token === "PHONE_ONLY") return { link: null, policy: "phone" };
  const link = parseReservationLink(answer);
  return link ? { link, policy: "online" } : { link: null, policy: null };
}

export function parseReservationLink(raw: string | null | undefined): string | null {
  const text = aiAnswerLine(raw);
  if (!text || /\s/.test(text)) return null; // empty, or a sentence rather than a URL

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname;

  if (ALLOWED_HOSTS.includes(host)) return text;
  if (RESERVATIONS_PATH_ONLY.some((d) => hostMatches(host, d))) {
    return /\/reservations?(\/|$)/i.test(path) ? text : null;
  }
  // A booking page on an ordering platform (Reserve with Google, Sauce's
  // /ordering/Reserve, toasttab.com/<slug>/reservations) is still a booking page.
  if (/reserv/i.test(path)) return text;
  if (host.startsWith("order.") || host === "order.online") return null;
  if (BLOCKED_HOSTS.some((d) => hostMatches(host, d))) return null;
  if (ORDERING_PATH.test(path)) return null;
  return text;
}

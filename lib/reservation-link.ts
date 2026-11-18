/**
 * Validates the Airtable reservation_link AI field before it reaches
 * `restaurants.reservation_link`, which the restaurant page renders as a
 * "Reserve" button. Rejects prose ("Nothing found.", "NONE", explanations)
 * and online-ordering / delivery / listing links the model returns when a
 * place has no reservations.
 *
 * Relative imports only: also used by scripts/ run via tsx.
 */

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

export function parseReservationLink(raw: string | null | undefined): string | null {
  // Web-search agents often explain before answering ("Based on my search…\n\nNONE"),
  // so the answer is the last non-empty line, minus any wrapping markdown.
  const lastLine = raw?.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop();
  const text = lastLine?.replace(/^[`<("']+|[`>)"'.,]+$/g, "");
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

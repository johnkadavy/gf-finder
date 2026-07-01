const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://trycleanplate.com";

export type DigestRestaurant = {
  id: number;
  name: string;
  slug: string | null;
  neighborhood: string | null;
  score: number;
  dossier: { summary?: { short_summary?: string } } | null;
  editorial_note?: string | null;
};

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function scoreColor(score: number): string {
  if (score >= 85) return "#4A7C59";
  if (score >= 75) return "#576A8F";
  if (score >= 65) return "#6B78C5";
  if (score >= 55) return "#8B7BC5";
  if (score >= 40) return "#C5A04A";
  return "#FF7444";
}

export function buildDigestEmail({
  label,
  restaurants,
  unsubscribeUrl,
  rankingsUrl,
  totalCount,
  introCopy,
}: {
  label: string;
  restaurants: DigestRestaurant[];
  unsubscribeUrl: string;
  rankingsUrl?: string;
  totalCount?: number;
  introCopy?: string;
}): string {
  const subjectLabel = escapeHtml(label);

  const restaurantCards = restaurants
    .map((r, i) => {
      const score = Math.round(r.score);
      const color = scoreColor(r.score);
      const href = `${SITE_URL}/restaurant/${r.slug ?? r.id}`;
      const summary = r.editorial_note || r.dossier?.summary?.short_summary;
      const isLast = i === restaurants.length - 1;

      return `
        <tr>
          <td style="padding:24px 32px;${isLast ? "" : "border-bottom:1px solid #ececec;"}">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td valign="top">
                  <a href="${href}" style="font-size:18px;font-weight:700;color:#111111;text-decoration:none;font-family:Georgia,serif;line-height:1.3;">${escapeHtml(r.name)}</a>
                  ${r.neighborhood ? `
                  <p style="margin:5px 0 0;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#999999;font-family:'Courier New',Courier,monospace;">${escapeHtml(r.neighborhood)}</p>` : ""}
                </td>
                <td valign="top" align="right" width="64" style="padding-left:16px;">
                  <span style="font-size:24px;font-weight:700;font-family:'Courier New',Courier,monospace;color:${color};line-height:1;">${score}</span>
                  <p style="margin:3px 0 0;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:#bbbbbb;font-family:'Courier New',Courier,monospace;">GF Safety</p>
                </td>
              </tr>
              ${summary ? `
              <tr>
                <td colspan="2" style="padding-top:10px;">
                  <p style="margin:0;font-size:14px;line-height:1.65;color:#555555;font-family:Georgia,serif;">${escapeHtml(summary)}</p>
                </td>
              </tr>` : ""}
            </table>
          </td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f3f1;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f3f1;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid #e2e0dd;max-width:560px;width:100%;">

        <!-- Header: brand kicker small, topic as the headline -->
        <tr>
          <td style="padding:28px 32px 22px;border-bottom:2px solid #111111;">
            <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#FF7444;font-family:'Courier New',Courier,monospace;">CleanPlate</p>
            <p style="margin:0;font-size:24px;font-weight:700;color:#111111;font-family:Georgia,serif;line-height:1.25;">${subjectLabel}</p>
          </td>
        </tr>

        <!-- Intro copy -->
        ${introCopy ? `
        <tr>
          <td style="padding:22px 32px 20px;border-bottom:1px solid #ececec;">
            <p style="margin:0;font-size:15px;line-height:1.7;color:#444444;font-family:Georgia,serif;">${escapeHtml(introCopy)}</p>
          </td>
        </tr>` : ""}

        <!-- Restaurant cards -->
        ${restaurantCards}

        <!-- CTA -->
        ${rankingsUrl ? `
        <tr>
          <td style="padding:22px 32px;border-top:1px solid #ececec;background:#faf9f8;">
            <a href="${SITE_URL}${escapeHtml(rankingsUrl)}"
               style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#FF7444;text-decoration:none;font-weight:700;font-family:'Courier New',Courier,monospace;">
              See${totalCount ? ` all ${totalCount}` : " the full list of"} restaurants &rarr;
            </a>
          </td>
        </tr>` : ""}

        <!-- Footer -->
        <tr>
          <td style="padding:18px 32px 22px;border-top:1px solid #ececec;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#999999;font-family:Georgia,serif;">
              You&rsquo;re subscribed to the CleanPlate NYC digest.
              <a href="${unsubscribeUrl}" style="color:#999999;">Unsubscribe</a> &middot;
              <a href="${SITE_URL}" style="color:#999999;">trycleanplate.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

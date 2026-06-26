const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://trycleanplate.com";

export type DigestRestaurant = {
  id: number;
  name: string;
  slug: string | null;
  neighborhood: string | null;
  score: number;
  dossier: { summary?: { short_summary?: string } } | null;
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
    .map((r) => {
      const score = Math.round(r.score);
      const color = scoreColor(r.score);
      const href = `${SITE_URL}/restaurant/${r.slug ?? r.id}`;
      const summary = r.dossier?.summary?.short_summary;

      return `
        <tr>
          <td style="padding:20px 36px 24px;border-bottom:1px solid #e8e8e8;">
            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
              <tr>
                <td style="padding-bottom:6px;">
                  <span style="font-size:22px;font-weight:700;font-family:'Courier New',Courier,monospace;color:${color};">${score}</span>
                  <span style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#aaaaaa;font-family:'Courier New',Courier,monospace;margin-left:8px;">GF Safety</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:4px;">
                  <a href="${href}" style="font-size:17px;font-weight:700;color:#111111;text-decoration:none;letter-spacing:0.02em;font-family:Georgia,serif;">${escapeHtml(r.name)}</a>
                </td>
              </tr>
              ${r.neighborhood ? `
              <tr>
                <td style="padding-bottom:8px;">
                  <span style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#888888;font-family:'Courier New',Courier,monospace;">${escapeHtml(r.neighborhood)}</span>
                </td>
              </tr>` : ""}
              ${summary ? `
              <tr>
                <td style="padding-bottom:12px;">
                  <p style="margin:0;font-size:13px;line-height:1.7;color:#555555;font-family:Georgia,serif;">${escapeHtml(summary)}</p>
                </td>
              </tr>` : ""}
              <tr>
                <td>
                  <a href="${href}" style="font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#FF7444;text-decoration:none;font-family:'Courier New',Courier,monospace;">View on CleanPlate &rarr;</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:'Courier New',Courier,monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f0f0f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid #d8d8d8;max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding:28px 36px 24px;border-bottom:2px solid #111111;">
            <p style="margin:0;font-size:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#111111;">CleanPlate</p>
            <p style="margin:4px 0 0;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#888888;">${subjectLabel}</p>
          </td>
        </tr>

        <!-- Intro copy -->
        ${introCopy ? `
        <tr>
          <td style="padding:20px 36px 0;">
            <p style="margin:0;font-size:14px;line-height:1.75;color:#444444;font-family:Georgia,serif;">${escapeHtml(introCopy)}</p>
          </td>
        </tr>` : ""}

        <!-- Restaurant cards -->
        ${restaurantCards}

        <!-- CTA -->
        ${rankingsUrl ? `
        <tr>
          <td style="padding:24px 36px;border-top:2px solid #111111;">
            <a href="${SITE_URL}${escapeHtml(rankingsUrl)}"
               style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#FF7444;text-decoration:none;font-family:'Courier New',Courier,monospace;">
              See${totalCount ? ` all ${totalCount}` : " the full list of"} restaurants &rarr;
            </a>
          </td>
        </tr>` : ""}

        <!-- Footer -->
        <tr>
          <td style="padding:20px 36px;border-top:1px solid #e8e8e8;">
            <p style="margin:0 0 6px;font-size:10px;line-height:1.6;color:#aaaaaa;letter-spacing:0.06em;text-transform:uppercase;">
              You&rsquo;re subscribed to the CleanPlate NYC digest.
            </p>
            <p style="margin:0;font-size:10px;color:#aaaaaa;letter-spacing:0.06em;text-transform:uppercase;">
              <a href="${unsubscribeUrl}" style="color:#aaaaaa;">Unsubscribe</a>
              &nbsp;&mdash;&nbsp;
              <a href="${SITE_URL}" style="color:#aaaaaa;">trycleanplate.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Fetches Bebas Neue as TTF (compatible with satori/ImageResponse)
// Falls back to null so callers can render without a custom font
export async function loadBebasNeue(): Promise<ArrayBuffer | null> {
  try {
    // Request TTF via an old user-agent (Google Fonts serves TTF for legacy browsers)
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap",
      {
        headers: {
          "User-Agent":
            "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)",
        },
      }
    ).then((r) => r.text());

    const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!url) return null;

    return fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

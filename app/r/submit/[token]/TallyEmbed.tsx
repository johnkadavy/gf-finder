"use client";

import Script from "next/script";

declare global {
  interface Window {
    Tally?: { loadEmbeds: () => void };
  }
}

/**
 * Tally form iframe. Tally's embed script reads `data-tally-src` and resizes
 * the iframe to the form's height (dynamicHeight=1).
 */
export function TallyEmbed({ src, title }: { src: string; title: string }) {
  return (
    <>
      <iframe
        data-tally-src={src}
        src={src}
        title={title}
        loading="eager"
        width="100%"
        height={800}
        className="block w-full border-0"
      />
      <Script
        src="https://tally.so/widgets/embed.js"
        strategy="afterInteractive"
        onReady={() => window.Tally?.loadEmbeds()}
      />
    </>
  );
}

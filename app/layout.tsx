import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Image from "next/image";
import Script from "next/script";
import { Nav } from "./components/Nav";
import { Footer } from "./components/Footer";
import { ThemeToggle } from "./components/ThemeToggle";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import localFont from "next/font/local";
import "./globals.css";

// Fonts are self-hosted (app/fonts, latin subset, SIL OFL — licenses alongside)
// rather than fetched from Google Fonts at build time: next/font/google
// intermittently fails the build when Google returns extensionless
// /l/font?kit=… URLs. Visitors get the same files from our domain either way.
const ibmPlexSans = localFont({
  src: [
    { path: "./fonts/ibm-plex-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
  adjustFontFallback: "Arial",
});
const ibmPlexMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
  preload: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  adjustFontFallback: false,
});
const bebasNeue = localFont({
  src: "./fonts/bebas-neue-latin-400-normal.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-display",
  display: "swap",
  fallback: ["Impact", "sans-serif"],
  adjustFontFallback: "Arial",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  title: "CleanPlate — NYC's Gluten-Free Restaurant Guide",
  description: "Find and save gluten-free restaurants, scored for safety. No guessing.",
  metadataBase: new URL("https://trycleanplate.com"),
  openGraph: {
    siteName: "CleanPlate",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "CleanPlate — NYC's Gluten-Free Restaurant Guide" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
    : null;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* No-flash theme: set the theme class before first paint from stored
            preference, falling back to the OS setting, then dark. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.classList.add(t);}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
        {supabaseHostname && <link rel="preconnect" href={supabaseHostname} />}
      </head>
      <body
        className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${bebasNeue.variable} font-sans antialiased`}
      >
        {/* Subtle noise texture */}
        <div className="noise-overlay" aria-hidden="true" />

        {/* Nav */}
        <header
          className="fixed top-0 w-full z-50 border-b"
          style={{ borderColor: "var(--border-default)", backgroundColor: "var(--surface-base)" }}
        >
          <div className="flex justify-between items-center px-4 md:px-8 h-16">
            <Link href="/" className="flex items-center gap-1.5">
              <div className="relative group" style={{ transform: "translate(4px, -2px)" }}>
                <Image
                  src="/guanaco_logo.svg"
                  alt="Guanaco logo"
                  width={32}
                  height={32}
                  priority
                />
                <div className="absolute left-0 top-full mt-2 px-3 py-1.5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50"
                  style={{ backgroundColor: "var(--surface-overlay)", border: "1px solid var(--border-emphasis)" }}>
                  <span className="font-mono text-ui-sm uppercase tracking-label text-text-tertiary">
                    Guanacos eat gluten-free
                  </span>
                </div>
              </div>
              <span className="font-[family-name:var(--font-display)] text-2xl tracking-wider" style={{ color: "var(--text-primary)" }}>
                CleanPlate
              </span>
            </Link>
            <div className="flex items-center gap-4 md:gap-6">
              <ThemeToggle />
              <Nav />
            </div>
          </div>
        </header>

        <Providers>
          <div className="min-h-dvh">{children}</div>
        </Providers>
        <Analytics />
        <SpeedInsights />
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "wrj55k8qoc");`}
        </Script>

        <Footer />
      </body>
    </html>
  );
}

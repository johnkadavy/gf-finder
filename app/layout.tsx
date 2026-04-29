import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Nav } from "./components/Nav";
import { Footer } from "./components/Footer";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Bebas_Neue } from "next/font/google";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});
const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CleanPlate — NYC's Gluten-Free Restaurant Guide",
  description: "Find and save gluten-free restaurants, scored for safety. No guessing.",
  metadataBase: new URL("https://trycleanplate.com"),
  openGraph: {
    siteName: "CleanPlate",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
    : null;

  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://api.mapbox.com" />
        <link rel="preconnect" href="https://events.mapbox.com" />
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
          style={{ borderColor: "oklch(0.22 0 0)", backgroundColor: "oklch(0.08 0 0)" }}
        >
          <div className="flex justify-between items-center px-4 md:px-8 h-16">
            <Link href="/" className="flex items-center gap-1.5">
              <div className="relative group">
                <Image
                  src="/guanaco_logo.svg"
                  alt="Guanaco logo"
                  width={32}
                  height={32}
                  priority
                />
                <div className="absolute left-0 top-full mt-2 px-3 py-1.5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-50"
                  style={{ backgroundColor: "oklch(0.18 0 0)", border: "1px solid oklch(0.28 0 0)" }}>
                  <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[oklch(0.7_0_0)]">
                    Guanacos eat gluten-free
                  </span>
                </div>
              </div>
              <span className="font-[family-name:var(--font-display)] text-2xl tracking-wider text-white">
                CleanPlate
              </span>
            </Link>
            <Nav />
          </div>
        </header>

        <div className="min-h-screen pb-16 md:pb-0">{children}</div>
        <Analytics />
        <SpeedInsights />

        <Footer />
      </body>
    </html>
  );
}

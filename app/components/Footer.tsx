"use client";

import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  if (pathname === "/ask") return null;

  return (
    <footer
      className="border-t py-10 px-8"
      style={{ borderColor: "oklch(0.22 0 0)" }}
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center max-w-screen-xl mx-auto gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-6">
            <span className="font-[family-name:var(--font-display)] text-xl tracking-wider text-white">
              CleanPlate
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[oklch(0.60_0_0)]">
              v.01 / Experimental
            </span>
          </div>
          <p className="font-mono text-[10px] text-[oklch(0.58_0_0)] leading-relaxed">
            Informational only. Based on public data and user reports. Not medical advice. Always verify with the restaurant.
          </p>
        </div>
        <div className="flex gap-8 font-mono text-[10px] uppercase tracking-[0.2em]">
          <a href="#" className="text-[oklch(0.62_0_0)] hover:text-white transition-colors duration-200">Privacy</a>
          <a href="#" className="text-[oklch(0.62_0_0)] hover:text-white transition-colors duration-200">Terms</a>
          <a href="#" className="text-[oklch(0.62_0_0)] hover:text-white transition-colors duration-200">Contact</a>
        </div>
      </div>
    </footer>
  );
}

"use client";

import { usePathname } from "next/navigation";

export function Footer() {
  const pathname = usePathname();
  if (pathname === "/ask") return null;

  return (
    <footer
      className="border-t pt-10 pb-24 md:py-10 px-8"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center max-w-screen-xl mx-auto gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-6">
            <span className="font-[family-name:var(--font-display)] text-xl tracking-wider text-text-primary">
              CleanPlate
            </span>
            <span className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim">
              v.01 / Experimental
            </span>
          </div>
          <p className="font-mono text-ui-sm text-text-dim leading-relaxed">
            Informational only. Based on public data and user reports. Not medical advice. Always verify with the restaurant.
          </p>
        </div>
        <div className="flex gap-8 font-mono text-ui-sm uppercase tracking-editorial">
          <a href="#" className="text-text-label hover:text-text-primary transition-colors duration-200">Privacy</a>
          <a href="#" className="text-text-label hover:text-text-primary transition-colors duration-200">Terms</a>
          <a href="#" className="text-text-label hover:text-text-primary transition-colors duration-200">Contact</a>
        </div>
      </div>
    </footer>
  );
}

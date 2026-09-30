"use client";

import Link from "next/link";
import { useEffect } from "react";
import { capture } from "@/lib/analytics";

/** Fires `search_results_shown` once per rendered results page (incl. zero results). */
export function SearchResultsShown({
  query,
  resultCount,
  strongCount,
  shown,
  city,
}: {
  query: string;
  resultCount: number;
  strongCount: number;
  shown: number;
  city: string;
}) {
  useEffect(() => {
    capture("search_results_shown", {
      query,
      result_count: resultCount,
      strong_count: strongCount,
      shown,
      city,
    });
  }, [query, resultCount, strongCount, shown, city]);
  return null;
}

/** A result/shortcut link that records `search_result_clicked` before navigating. */
export function TrackedResultLink({
  href,
  className,
  style,
  children,
  event,
  scroll,
}: {
  href: string;
  scroll?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  event: Record<string, unknown>;
}) {
  return (
    <Link
      href={href}
      className={className}
      style={style}
      scroll={scroll}
      onClick={() => capture("search_result_clicked", { source: "results", ...event })}
    >
      {children}
    </Link>
  );
}

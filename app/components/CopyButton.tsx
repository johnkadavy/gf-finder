"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="font-mono text-[10px] uppercase tracking-[0.2em] px-4 py-2 border transition-colors shrink-0"
      style={
        copied
          ? { borderColor: "#4A7C59", color: "#4A7C59" }
          : { borderColor: "oklch(0.28 0 0)", color: "oklch(0.55 0 0)" }
      }
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

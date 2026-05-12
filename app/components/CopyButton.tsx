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
      className="font-mono text-ui-sm uppercase tracking-editorial px-4 py-2 border transition-colors shrink-0"
      style={
        copied
          ? { borderColor: "#4A7C59", color: "#4A7C59" }
          : { borderColor: "var(--border-emphasis)", color: "var(--text-dim)" }
      }
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}

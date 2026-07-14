"use client";

import { useRef, useState } from "react";
import { updateDisplayName } from "./actions";

export function DisplayNameForm({ current }: { current: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current ?? "");
  const [draft, setDraft] = useState(current ?? "");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const next = (fd.get("display_name") as string ?? "").trim();
    setPending(true);
    await updateDisplayName(fd);
    setValue(next);
    setPending(false);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <p className="font-mono text-ui-lg" style={{ color: value ? "var(--text-secondary)" : "var(--text-disabled)" }}>
          {value || "Not set"}
        </p>
        <button
          onClick={() => { setDraft(value); setEditing(true); setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0); }}
          className="font-mono text-ui-sm uppercase tracking-editorial transition-colors hover:text-accent"
          style={{ color: "var(--text-disabled)" }}
        >
          {value ? "Edit" : "Set"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          name="display_name"
          defaultValue={value}
          maxLength={40}
          placeholder="e.g. John"
          className="font-mono text-ui-lg outline-none px-3 py-2 border w-48"
          style={{
            backgroundColor: "var(--surface-base)",
            borderColor: "var(--border-emphasis)",
            color: "var(--text-secondary)",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-emphasis)")}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="submit"
          disabled={pending}
          className="font-mono text-ui-sm uppercase tracking-editorial px-3 py-2 border transition-colors disabled:opacity-40"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="font-mono text-ui-sm uppercase tracking-editorial transition-colors hover:text-text-primary"
          style={{ color: "var(--text-disabled)" }}
        >
          Cancel
        </button>
      </div>

      {/* Live preview */}
      <p className="font-mono text-ui-md" style={{ color: "var(--text-disabled)" }}>
        Preview:{" "}
        <span style={{ color: draft.trim() ? "var(--text-dim)" : "var(--border-emphasis)" }}>
          {draft.trim() ? `${draft.trim()}'s Gluten-Free Spots` : "Your Gluten-Free Spots"}
        </span>
      </p>
    </form>
  );
}

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
        <p className="font-mono text-[13px]" style={{ color: value ? "oklch(0.78 0 0)" : "oklch(0.38 0 0)" }}>
          {value || "Not set"}
        </p>
        <button
          onClick={() => { setDraft(value); setEditing(true); setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0); }}
          className="font-mono text-[10px] uppercase tracking-[0.2em] transition-colors hover:text-[#FF7444]"
          style={{ color: "oklch(0.42 0 0)" }}
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
          className="font-mono text-[13px] outline-none px-3 py-2 border w-48"
          style={{
            backgroundColor: "oklch(0.09 0 0)",
            borderColor: "oklch(0.3 0 0)",
            color: "oklch(0.88 0 0)",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "#FF7444")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "oklch(0.3 0 0)")}
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="submit"
          disabled={pending}
          className="font-mono text-[10px] uppercase tracking-[0.2em] px-3 py-2 border transition-colors disabled:opacity-40"
          style={{ borderColor: "#FF7444", color: "#FF7444" }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="font-mono text-[10px] uppercase tracking-[0.2em] transition-colors hover:text-white"
          style={{ color: "oklch(0.4 0 0)" }}
        >
          Cancel
        </button>
      </div>

      {/* Live preview */}
      <p className="font-mono text-[11px]" style={{ color: "oklch(0.38 0 0)" }}>
        Preview:{" "}
        <span style={{ color: draft.trim() ? "oklch(0.58 0 0)" : "oklch(0.32 0 0)" }}>
          {draft.trim() ? `${draft.trim()}'s Gluten-Free Spots` : "Your Gluten-Free Spots"}
        </span>
      </p>
    </form>
  );
}

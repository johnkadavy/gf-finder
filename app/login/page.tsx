"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/map";
  const hasError = searchParams.get("error") === "invalid_link";

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(hasError ? "That link is invalid or has expired. Try again." : null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}`,
      },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSubmitted(true);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 justify-center">
          <Image src="/guanaco_logo.svg" alt="Guanaco logo" width={28} height={28} />
          <span className="font-[family-name:var(--font-display)] text-2xl tracking-wider text-white">
            CleanPlate
          </span>
        </Link>

        {submitted ? (
          <div className="space-y-4 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.78_0_0)]">
              Check your email
            </p>
            <p className="text-[14px] text-[oklch(0.65_0_0)] leading-relaxed">
              We sent a login link to <span className="text-white">{email}</span>.
              Click it to continue.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.78_0_0)] text-center">
                Sign in to save restaurants
              </p>
              <p className="text-[13px] text-[oklch(0.55_0_0)] text-center leading-relaxed">
                We&apos;ll email you a magic link — no password needed.
              </p>
            </div>

            {error && (
              <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-[#FF7444] text-center">
                {error}
              </p>
            )}

            <div className="space-y-3">
              <input
                type="email"
                required
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent border px-4 py-3 font-mono text-[13px] text-white placeholder:text-[oklch(0.35_0_0)] outline-none focus:border-[oklch(0.45_0_0)] transition-colors"
                style={{ borderColor: "oklch(0.22 0 0)" }}
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-black bg-white hover:bg-[oklch(0.85_0_0)] disabled:opacity-50 transition-colors"
              >
                {loading ? "Sending…" : "Send magic link"}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

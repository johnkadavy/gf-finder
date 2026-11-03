import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-admin";
import { resolveInvite, tallyHiddenFields } from "@/lib/invites";
import { TallyEmbed } from "./TallyEmbed";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tell us about your kitchen · CleanPlate",
  robots: { index: false, follow: false },
};

/**
 * Restaurant submission form, reached only through an invite link
 * (scripts/create-invite.ts). The token is checked here before the Tally
 * form is shown, and again by the webhook before anything is stored.
 */
export default async function SubmitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await resolveInvite(supabaseServer, token);

  if (state.status === "unknown") notFound();

  if (state.status !== "valid") {
    return (
      <Shell eyebrow="Link no longer active" title={state.restaurantName}>
        <p className="text-ui-body leading-relaxed text-text-secondary">
          This invite link has {state.status === "expired" ? "expired" : "been turned off"}. Reply to the email
          you received from CleanPlate and we&apos;ll send a fresh one.
        </p>
      </Shell>
    );
  }

  const formId = process.env.TALLY_PROTOCOL_FORM_ID;
  const restaurantName = state.invite.restaurant.display_name ?? state.invite.restaurant.name;

  if (!formId) {
    return (
      <Shell eyebrow="Kitchen practices" title={restaurantName}>
        <p className="text-ui-body text-text-secondary">The form isn&apos;t configured yet (TALLY_PROTOCOL_FORM_ID).</p>
      </Shell>
    );
  }

  const query = new URLSearchParams({
    alignLeft: "1",
    hideTitle: "1",
    transparentBackground: "1",
    dynamicHeight: "1",
    ...tallyHiddenFields(token, state.invite),
  });

  return (
    <Shell eyebrow="Kitchen practices" title={restaurantName}>
      <TallyEmbed src={`https://tally.so/embed/${formId}?${query}`} title={`Kitchen practices form for ${restaurantName}`} />
    </Shell>
  );
}

function Shell({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <main className="pt-16">
      <section className="border-b px-4 py-12 md:px-8 md:py-16" style={{ borderColor: "var(--border-default)" }}>
        <div className="max-w-2xl mx-auto">
          <p className="font-mono text-ui-sm uppercase tracking-stamp text-text-label mb-4">{eyebrow}</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-none tracking-wider text-text-primary">
            {title}
          </h1>
        </div>
      </section>
      <div className="max-w-2xl mx-auto px-4 py-10 md:px-8">{children}</div>
    </main>
  );
}

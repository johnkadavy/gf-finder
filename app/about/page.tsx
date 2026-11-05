import Link from "next/link";

const SCORE_INPUTS = [
  {
    label: "Reviews",
    body: "What recent diners report, including any sick reports, and how recent those reviews are.",
  },
  {
    label: "Menu",
    body: "Whether gluten-free items are clearly labeled and how many real options there are.",
  },
  {
    label: "Kitchen",
    body: "How well staff understand gluten-free needs, cross-contamination risk, and dedicated equipment like a separate fryer.",
  },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-ui-sm uppercase tracking-stamp text-text-label mb-6">
      {children}
    </p>
  );
}

export default function AboutPage() {
  return (
    <main className="pt-16">
      {/* Header band */}
      <section
        className="grid-bg border-b px-8 py-20 md:py-28"
        style={{ borderColor: "var(--border-default)" }}
      >
        <div className="max-w-3xl mx-auto">
          <SectionLabel>About CleanPlate</SectionLabel>
          <h1
            className="font-[family-name:var(--font-display)] leading-none"
            style={{ fontSize: "clamp(3.5rem, 10vw, 7rem)" }}
          >
            Less guesswork.
            <br />
            <span style={{ color: "var(--accent)" }}>More confidence.</span>
          </h1>
        </div>
      </section>

      {/* Body */}
      <div className="px-8 py-16 md:py-24">
        <article className="max-w-3xl mx-auto">
          {/* Intro */}
          <div className="space-y-6 text-ui-body leading-loose text-text-secondary">
            <p>
              Eating gluten-free should feel simple and predictable. Most of the time it
              doesn&apos;t. You&apos;re reading old reviews, scanning menus for a &ldquo;GF&rdquo;
              tag, and hoping the kitchen knows what cross-contamination means.
            </p>
            <p className="text-text-primary">
              CleanPlate does that research for you. We score restaurants from 0 to 100 on how
              safely they handle gluten-free dining, so you can decide in seconds instead of an
              hour.
            </p>
          </div>

          {/* How the score works */}
          <section className="mt-20">
            <SectionLabel>How the score works</SectionLabel>
            <div
              className="grid grid-cols-1 md:grid-cols-3 gap-px border"
              style={{ borderColor: "var(--border-default)", background: "var(--border-default)" }}
            >
              {SCORE_INPUTS.map((input) => (
                <div
                  key={input.label}
                  className="p-6"
                  style={{ background: "var(--surface-raised)" }}
                >
                  <p className="font-mono text-ui-md uppercase tracking-editorial text-text-primary mb-4">
                    {input.label}
                  </p>
                  <p className="text-ui-xl leading-relaxed text-text-tertiary">{input.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-ui-xl leading-relaxed text-text-tertiary">
              When the data is thin, scores stay closer to the middle. We&apos;d rather be
              cautious than confidently wrong.
            </p>
          </section>

          {/* Raising the bar */}
          <section className="mt-20">
            <SectionLabel>Raising the bar</SectionLabel>
            <p className="text-ui-body leading-loose text-text-secondary">
              Making safety practices visible rewards the restaurants that get it right and gives
              the rest a reason to catch up. Restaurants can also tell us about their own
              practices directly.
            </p>
          </section>

          {/* Disclaimer */}
          <aside
            className="mt-16 border p-6 md:p-8"
            style={{
              background: "var(--signal-bg-warning)",
              borderColor: "var(--signal-border-warning)",
            }}
          >
            <p className="font-mono text-ui-sm uppercase tracking-stamp mb-3 text-signal-warning">
              A guide, not a guarantee
            </p>
            <p className="text-ui-xl leading-relaxed text-text-secondary">
              Kitchens change, and no dataset sees everything in real time. Always confirm with
              the restaurant and trust your own judgment.
            </p>
          </aside>

          {/* Sign-off */}
          <p className="mt-16 text-ui-body leading-loose text-text-secondary">
            Eat well,
            <br />
            <span
              className="font-[family-name:var(--font-display)] tracking-label text-text-primary"
              style={{ fontSize: "clamp(1.5rem, 4vw, 1.9rem)" }}
            >
              CleanPlate
            </span>
          </p>

          {/* Divider */}
          <div className="my-16 border-t" style={{ borderColor: "var(--border-default)" }} />

          {/* CTA */}
          <div>
            <SectionLabel>Ready to explore?</SectionLabel>
            <div className="flex flex-col sm:flex-row gap-4">
              {[
                { href: "/rankings", label: "Browse rankings" },
                { href: "/map", label: "Open the map" },
              ].map((cta) => (
                <Link
                  key={cta.href}
                  href={cta.href}
                  className="group inline-flex items-center justify-between gap-4 border px-8 py-4 font-mono text-ui-md uppercase tracking-editorial text-text-primary hover:border-accent hover:text-accent transition-all duration-200"
                  style={{ borderColor: "var(--border-emphasis)" }}
                >
                  {cta.label}
                  <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                </Link>
              ))}
            </div>
          </div>
        </article>
      </div>
    </main>
  );
}

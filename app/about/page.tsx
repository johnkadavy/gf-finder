export default function AboutPage() {
  return (
    <main className="pt-16">
      {/* Header band */}
      <section
        className="grid-bg border-b px-8 py-20 md:py-28"
        style={{ borderColor: "oklch(0.22 0 0)" }}
      >
        <div className="max-w-3xl mx-auto">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[oklch(0.65_0_0)] mb-6">
            About CleanPlate
          </p>
          <h1
            className="font-[family-name:var(--font-display)] leading-none"
            style={{ fontSize: "clamp(3rem, 8vw, 5.5rem)", letterSpacing: "0.02em" }}
          >
            Less guesswork.
            <br />
            <span style={{ color: "#FF7444" }}>More confidence.</span>
          </h1>
        </div>
      </section>

      {/* Body */}
      <article className="max-w-3xl mx-auto px-8 py-16 md:py-24">
        <div className="space-y-8 text-[16px] leading-[1.85] text-[oklch(0.82_0_0)]">
          <p>
            Eating gluten-free should feel simple and predictable.
          </p>
          <p>
            CleanPlate exists to make that possible. We bring together the signals that matter —
            from menus and certifications to kitchen practices and recent diner experiences —
            so you can quickly understand how a restaurant approaches gluten-free dining.
          </p>
          <p>
            The goal is clarity. Less guesswork, more confidence.
          </p>
          <p>
            This is not just about finding the best gluten-free restaurants. It is about raising
            the standard across all of them. By making safety signals more visible, we aim to
            encourage better practices and more transparency throughout the industry.
          </p>
          <p className="text-[oklch(0.72_0_0)]">
            <strong className="text-[oklch(0.88_0_0)] font-medium">CleanPlate is a guide, not a guarantee.</strong> Kitchen environments can change, and no
            dataset can capture everything in real time. Always confirm details with the
            restaurant and use your own judgment when making decisions.
          </p>
          <p className="text-[oklch(0.72_0_0)]">
            We are here to give you better visibility so you can spend less time researching
            and more time enjoying your meal.
          </p>
          <p className="pt-6">
            Eat well,
            <br />
            <span className="font-[family-name:var(--font-display)] text-2xl tracking-wider text-white">CleanPlate</span>
          </p>
        </div>

        {/* Divider */}
        <div
          className="my-16 border-t"
          style={{ borderColor: "oklch(0.22 0 0)" }}
        />

        {/* CTA */}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[oklch(0.65_0_0)] mb-6">
            Ready to explore?
          </p>
          <a
            href="/"
            className="group inline-flex items-center gap-4 border px-8 py-4 font-mono text-[11px] uppercase tracking-[0.2em] text-white hover:border-[#FF7444] hover:text-[#FF7444] transition-all duration-200"
            style={{ borderColor: "oklch(0.3 0 0)" }}
          >
            Start your search
            <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </a>
        </div>
      </article>
    </main>
  );
}

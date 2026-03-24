export default function AboutPage() {
  return (
    <main className="pt-16">
      {/* Header band */}
      <section
        className="grid-bg border-b px-8 py-20 md:py-28"
        style={{ borderColor: "oklch(0.22 0 0)" }}
      >
        <div className="max-w-3xl mx-auto">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[oklch(0.4_0_0)] mb-6">
            A Note from the Creator
          </p>
          <h1
            className="font-[family-name:var(--font-display)] leading-none"
            style={{ fontSize: "clamp(3rem, 8vw, 5.5rem)", letterSpacing: "0.02em" }}
          >
            Why this
            <br />
            <span style={{ color: "#FF7444" }}>app exists</span>
          </h1>
        </div>
      </section>

      {/* Body */}
      <article className="max-w-3xl mx-auto px-8 py-16 md:py-24">
        <div className="space-y-8 font-mono text-[13px] leading-[1.9] text-[oklch(0.6_0_0)]">
          <p>Hello there,</p>
          <p>
            I started Gluten-Free Finder because I know exactly what it feels
            like to sit down at a restaurant and feel a wave of anxiety instead
            of excitement. As someone who lives with{" "}
            <strong className="text-[oklch(0.85_0_0)] font-medium">celiac disease</strong>, I&apos;ve
            spent years navigating the hidden risks of cross-contamination and
            the exhaustion of double-checking every single ingredient.
          </p>
          <p>
            This app wasn&apos;t born out of a business plan, but out of
            necessity. My goal is simple: to provide a streamlined, reliable way
            for our community to gather and assess safety information. We
            aggregate data from menus, certifications, and facility standards to
            help you see the bigger picture of a restaurant&apos;s safety
            protocols before you ever step through their door.
          </p>
          <p>
            However, I want to be very clear about how to use this tool.{" "}
            <strong className="text-[oklch(0.85_0_0)] font-medium">
              Gluten-Free Finder is designed for information gathering only.
            </strong>{" "}
            While we strive for the highest accuracy, kitchen environments can
            change in an instant. This tool should never be the sole factor in
            your final dining decision.
          </p>
          <p>
            Ultimately, you are responsible for your own safety. Always
            communicate your needs clearly to restaurant staff and use your own
            judgment. We are here to give you better tools for your toolkit, not
            to replace your own vigilance.
          </p>
          <p className="pt-6">
            Stay safe and eat well,
            <br />
            <span style={{ color: "#FF7444" }}>— The Radiant Guardian Team</span>
          </p>
        </div>

        {/* Divider */}
        <div
          className="my-16 border-t"
          style={{ borderColor: "oklch(0.22 0 0)" }}
        />

        {/* CTA */}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[oklch(0.4_0_0)] mb-6">
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

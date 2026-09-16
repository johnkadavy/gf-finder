"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { capture } from "@/lib/analytics";
import { type OrderLink, type OrderProvider } from "@/lib/order-links";
import { ORDER_BRANDS, PROVIDERS_WITH_LOGO } from "@/lib/order-brands";
import { TrackedCtaLink } from "./TrackedCtaLink";

const TRIGGER_CLASS =
  "font-mono text-ui-sm uppercase tracking-label px-4 py-2.5 border transition-all inline-flex items-center gap-2 hover:bg-accent-tint-md";
const COMMERCE_STYLE = {
  borderColor: "var(--accent-tint-xl)",
  color: "var(--accent)",
  backgroundColor: "var(--accent-tint-sm)",
} as const;

/** Logo image when we have an official asset, otherwise the service name in its brand color. */
function ProviderContent({ provider }: { provider: OrderProvider }) {
  const brand = ORDER_BRANDS[provider];
  if (PROVIDERS_WITH_LOGO.has(provider)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/brands/${provider}.svg`} alt={brand.label} style={{ height: "24px", width: "auto" }} />
    );
  }
  return (
    <span style={{ color: brand.color, fontFamily: "var(--font-sans)", fontSize: "17px", fontWeight: 500 }}>
      {brand.label}
    </span>
  );
}

/**
 * Adaptive order entry point:
 *   0 links  → renders nothing
 *   1 link   → a direct "Order Online" button (no modal for a single option)
 *   2+ links → a button that opens an accessible modal listing the services
 */
export function OrderMenu({
  restaurantId,
  neighborhood,
  orderLinks,
}: {
  restaurantId: number;
  neighborhood?: string | null;
  orderLinks: OrderLink[];
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = window.requestAnimationFrame(() => panelRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>("a[href], button");
      if (!focusables || focusables.length === 0) return;
      const list = Array.from(focusables);
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [open, close]);

  if (orderLinks.length === 0) return null;

  if (orderLinks.length === 1) {
    const only = orderLinks[0];
    return (
      <TrackedCtaLink
        restaurantId={restaurantId}
        cta="order"
        provider={only.provider}
        neighborhood={neighborhood}
        location="hero"
        href={only.url}
        target="_blank"
        rel="noopener noreferrer"
        className={TRIGGER_CLASS}
        style={COMMERCE_STYLE}
      >
        Order Online <span style={{ opacity: 0.7 }}>↗</span>
      </TrackedCtaLink>
    );
  }

  const openModal = () => {
    capture("order_options_opened", {
      restaurant_id: restaurantId,
      neighborhood: neighborhood ?? null,
      provider_count: orderLinks.length,
    });
    setOpen(true);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openModal}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={TRIGGER_CLASS}
        style={COMMERCE_STYLE}
      >
        Order Online <span style={{ opacity: 0.7, fontSize: "0.7em" }}>▼</span>
      </button>

      {mounted && open && createPortal(
        <div
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Order online"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(460px, 100%)",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              backgroundColor: "var(--surface-overlay)",
              border: "1px solid var(--border-emphasis)",
              boxShadow: "0 22px 60px rgba(0,0,0,0.55)",
              outline: "none",
            }}
          >
            <div
              className="font-mono uppercase tracking-label flex items-center justify-between"
              style={{ fontSize: "12px", color: "var(--text-dim)", padding: "18px 22px", borderBottom: "1px solid var(--border-subtle)" }}
            >
              <span>Order online</span>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="transition-colors hover:text-accent"
                style={{ color: "var(--text-tertiary)", background: "transparent", border: "none", cursor: "pointer", fontSize: "20px", lineHeight: 1, padding: "2px 4px" }}
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col" style={{ overflowY: "auto" }}>
              {orderLinks.map((ol) => (
                <TrackedCtaLink
                  key={ol.url}
                  restaurantId={restaurantId}
                  cta="order"
                  provider={ol.provider}
                  neighborhood={neighborhood}
                  location="hero"
                  href={ol.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={close}
                  className="flex items-center justify-between gap-4 transition-colors hover:bg-accent-tint-xs"
                  style={{ padding: "18px 22px", borderBottom: "1px solid var(--border-subtle)" }}
                >
                  <ProviderContent provider={ol.provider} />
                  <span style={{ opacity: 0.45, fontSize: "15px" }}>↗</span>
                </TrackedCtaLink>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

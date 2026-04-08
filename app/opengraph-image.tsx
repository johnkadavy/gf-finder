import { ImageResponse } from "next/og";
import { loadBebasNeue } from "./og-font";

export const alt = "CleanPlate — Gluten-Free Restaurants You Can Trust";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const fontData = await loadBebasNeue();
  const hasFont = !!fontData;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          backgroundColor: "#0d0d0d",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          borderLeft: "6px solid #FF7444",
        }}
      >
        {/* Top label */}
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 13,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "#555555",
          }}
        >
          CLEANPLATE
        </div>

        {/* Main content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              fontFamily: hasFont ? "BebasNeue" : "sans-serif",
              fontSize: 120,
              lineHeight: 0.9,
              color: "#f2f2f2",
              letterSpacing: "0.02em",
              fontWeight: hasFont ? 400 : 700,
            }}
          >
            {"Gluten-free"}
          </div>
          <div
            style={{
              fontFamily: hasFont ? "BebasNeue" : "sans-serif",
              fontSize: 120,
              lineHeight: 0.9,
              color: "#FF7444",
              letterSpacing: "0.02em",
              fontWeight: hasFont ? 400 : 700,
            }}
          >
            {"you can trust."}
          </div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 22,
              color: "#666666",
              letterSpacing: "0.08em",
              marginTop: 16,
            }}
          >
            Find and save gluten-free restaurants, scored for safety.
          </div>
        </div>

        {/* Bottom */}
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 14,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#444444",
          }}
        >
          trycleanplate.com
        </div>
      </div>
    ),
    {
      ...size,
      ...(hasFont && fontData
        ? { fonts: [{ name: "BebasNeue", data: fontData, style: "normal" as const, weight: 400 as const }] }
        : {}),
    }
  );
}

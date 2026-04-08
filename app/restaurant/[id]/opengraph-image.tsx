import { ImageResponse } from "next/og";
import { supabase } from "@/lib/supabase";
import { calculateScore, getGaugeColor, getScoreLabel, type ScoringDossier, type VerifiedData } from "@/lib/score";
import { loadBebasNeue } from "@/app/og-font";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fontData = await loadBebasNeue();
  const hasFont = !!fontData;

  const { data } = await supabase
    .from("restaurants")
    .select("name, city, neighborhood, dossier, verified_data")
    .eq("id", id)
    .single();

  const name = data?.name ?? "CleanPlate";
  const location = [data?.neighborhood, data?.city].filter(Boolean).join(" / ");
  const score = data?.dossier
    ? calculateScore(data.dossier as ScoringDossier, (data.verified_data ?? undefined) as VerifiedData | undefined)
    : null;
  const color = getGaugeColor(score);
  const { label } = getScoreLabel(score);

  const displayFont = hasFont ? "BebasNeue" : "sans-serif";
  const displayWeight = hasFont ? 400 : 700;

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
          borderLeft: `6px solid ${color}`,
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1, paddingRight: 60 }}>
            <div
              style={{
                fontFamily: displayFont,
                fontSize: name.length > 20 ? 88 : 112,
                lineHeight: 0.9,
                color: "#f2f2f2",
                letterSpacing: "0.02em",
                fontWeight: displayWeight,
              }}
            >
              {name}
            </div>
            {location && (
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 18,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "#666666",
                }}
              >
                {location}
              </div>
            )}
          </div>

          {/* Score */}
          {score !== null && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
              <div
                style={{
                  fontFamily: displayFont,
                  fontSize: 160,
                  lineHeight: 1,
                  color,
                  fontWeight: displayWeight,
                }}
              >
                {String(Math.round(score))}
              </div>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: 14,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "#888888",
                }}
              >
                {label}
              </div>
            </div>
          )}
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

import { ImageResponse } from "next/og";

export const alt = "TavernTable — Virtual D&D Tabletop";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#161320", // --ink
          padding: 80,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 110,
            height: 110,
            borderRadius: 20,
            background: "#221d2e", // --panel
            border: "3px solid #c9a227", // --gold
            color: "#c9a227",
            fontSize: 56,
            fontWeight: 700,
            fontFamily: "serif",
            marginBottom: 36,
          }}
        >
          T
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 72,
            fontWeight: 700,
            color: "#ece4d3", // --parchment
            fontFamily: "serif",
            letterSpacing: -1,
          }}
        >
          TavernTable
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 30,
            color: "#b9b0a0", // --parchment-dim
            marginTop: 20,
            textAlign: "center",
          }}
        >
          A virtual tabletop for playing D&D with friends
        </div>
      </div>
    ),
    { ...size }
  );
}

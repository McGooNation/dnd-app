import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#161320", // --ink
          borderRadius: 6,
          color: "#c9a227", // --gold
          fontSize: 22,
          fontWeight: 700,
          fontFamily: "serif",
        }}
      >
        T
      </div>
    ),
    { ...size }
  );
}

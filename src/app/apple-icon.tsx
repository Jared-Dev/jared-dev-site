import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #fbbf24 0%, #d97706 100%)",
          color: "#1a1208",
          fontSize: 96,
          fontWeight: 800,
          letterSpacing: -3,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        JM
      </div>
    ),
    size,
  );
}

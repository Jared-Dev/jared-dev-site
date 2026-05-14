import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Jared Malcolm · Frontend Engineering";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "64px",
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)",
          color: "#fafafa",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 22,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: "#888",
              marginBottom: 24,
            }}
          >
            Jared Malcolm · 14 years in software, frontend-focused
          </div>
          <div
            style={{
              fontSize: 58,
              fontWeight: 700,
              lineHeight: 1.1,
              maxWidth: 1050,
            }}
          >
            Full-stack background. Leadership or senior IC. Paste a JD for
            an honest read on fit.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            color: "#bbb",
          }}
        >
          <div>jareddev.com</div>
          <div>Paste a JD. Get an honest fit read.</div>
        </div>
      </div>
    ),
    size,
  );
}

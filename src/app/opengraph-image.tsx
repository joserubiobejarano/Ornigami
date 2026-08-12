import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Ornigami — practical tools for local growth";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        background: "#f8fafc",
        color: "#6d28d9",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "center",
        padding: "80px",
        width: "100%",
      }}
    >
      <div style={{ color: "#2563eb", display: "flex", fontSize: 32, fontWeight: 700 }}>ORNIGAMI</div>
      <div style={{ display: "flex", fontSize: 72, fontWeight: 700, marginTop: 24 }}>Practical tools for local growth</div>
      <div style={{ color: "#475569", display: "flex", fontSize: 30, marginTop: 28 }}>Reviews, follow-ups, and visibility workflows in one hub.</div>
    </div>
  );
}

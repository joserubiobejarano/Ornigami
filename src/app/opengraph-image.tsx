import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Ornigami — every review, answered in your voice";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(<div style={{ background: "#fbfaf6", color: "#123227", display: "flex", flexDirection: "column", height: "100%", justifyContent: "center", padding: "80px", width: "100%" }}><div style={{ color: "#15966a", display: "flex", fontSize: 32, fontWeight: 700 }}>ORNIGAMI</div><div style={{ display: "flex", fontSize: 72, fontWeight: 800, marginTop: 24 }}>Every review, answered in your voice.</div><div style={{ color: "#5e6d63", display: "flex", fontSize: 30, marginTop: 28 }}>Reviews, follow-ups, and visibility workflows in one calm workspace.</div></div>);
}

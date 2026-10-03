"use client";

import { useEffect, type CSSProperties } from "react";
import { captureBoundaryError, ERROR_FALLBACK_COPY } from "@/lib/error-visibility";

export function ErrorFallback({
  error,
  retry,
  boundary,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  boundary: "route" | "global";
}) {
  useEffect(() => {
    void captureBoundaryError(error, boundary);
  }, [error, boundary]);

  return (
    <main
      role="alert"
      style={{
        boxSizing: "border-box",
        display: "grid",
        minHeight: "70vh",
        placeItems: "center",
        padding: "3rem 1.5rem",
        color: "#17382d",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <section style={{ maxWidth: "32rem", textAlign: "center" }}>
        <div aria-hidden="true" style={{ fontSize: "2.5rem" }}>◇</div>
        <h1 style={{ margin: "1rem 0", fontSize: "2rem" }}>{ERROR_FALLBACK_COPY.title}</h1>
        <p>{ERROR_FALLBACK_COPY.message}</p>
        <p>{ERROR_FALLBACK_COPY.support}</p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.75rem", marginTop: "1.5rem" }}>
          <button type="button" onClick={retry} style={buttonStyle}>
            {ERROR_FALLBACK_COPY.retry}
          </button>
          {/* Keep a native navigation path available if the app router failed. */}
          <a href="/contact" style={{ ...buttonStyle, background: "transparent", color: "inherit" }}>
            {ERROR_FALLBACK_COPY.contact}
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ ...buttonStyle, background: "transparent", color: "inherit" }}>
            {ERROR_FALLBACK_COPY.home}
          </a>
        </div>
      </section>
    </main>
  );
}

const buttonStyle = {
  display: "inline-flex",
  minHeight: "2.75rem",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #b8c8c1",
  borderRadius: "9999px",
  background: "#e9ad38",
  color: "#17382d",
  padding: "0.5rem 1.25rem",
  fontSize: "0.9rem",
  fontWeight: 700,
  textDecoration: "none",
  cursor: "pointer",
} satisfies CSSProperties;

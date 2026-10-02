import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: "var(--primary)",
        "primary-foreground": "var(--primary-foreground)"
      },
      fontFamily: { sans: ["Avenir Next", "Segoe UI", "sans-serif"] }
    }
  },
  plugins: []
};

export default config;

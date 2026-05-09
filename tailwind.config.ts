import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        studyrank: {
          base: "#080810",
          surface: "#0f0f1a",
          card: "#1a1a2e",
          border: "#1e1e32",
          purple: "#6c64d4",
          gold: "#c9a227",
          primary: "#e8e8ff",
          secondary: "#888899",
          muted: "#444466",
          green: "#1D9E75",
          amber: "#EF9F27",
        },
      },
      fontFamily: {
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;

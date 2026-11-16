import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "var(--color-ink)",
          raised: "var(--color-ink-raised)",
        },
        ember: {
          DEFAULT: "var(--color-ember)",
          deep: "var(--color-ember-deep)",
        },
        paper: "var(--color-paper)",
        mist: "var(--color-mist)",
        charcoal: "var(--color-text)",
        muted: "var(--color-muted)",
        whatsapp: "var(--color-whatsapp)",
        success: "var(--color-success)",
        danger: "var(--color-danger)",
        border: "var(--color-border)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      borderRadius: {
        brand: "0.5rem",
        card: "0.75rem",
        pill: "9999px",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.08)",
        dropdown: "0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.2)",
      },
    },
  },
  plugins: [],
};

export default config;

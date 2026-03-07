/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'DM Sans'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
        display: ["'Syne'", "sans-serif"],
      },
      colors: {
        // Conductor palette — dark slate with amber accent
        bg: {
          base: "#0d0f12",
          surface: "#13161b",
          elevated: "#1a1e25",
          border: "#252a33",
        },
        accent: {
          DEFAULT: "#f5a623",
          dim: "#b87a1a",
          glow: "rgba(245, 166, 35, 0.15)",
        },
        text: {
          primary: "#e8ecf0",
          secondary: "#8b95a3",
          muted: "#4d5663",
        },
        status: {
          running: "#22c55e",
          stopped: "#4d5663",
          error: "#ef4444",
        },
      },
      borderRadius: {
        conductor: "6px",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.15s ease-out",
        "slide-up": "slideUp 0.2s ease-out",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

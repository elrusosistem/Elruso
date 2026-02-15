/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        deep: "#0B0F1A",
        surface: "#111827",
        elevated: "#1A2236",
        "accent-primary": "#6366F1",
        "accent-secondary": "#8B5CF6",
        "accent-cyan": "#06B6D4",
      },
      animation: {
        "fade-in-up": "fadeInUp 0.2s ease-out forwards",
        "fade-in": "fadeIn 0.2s ease-out forwards",
        "slide-in-left": "slideInLeft 0.2s ease-out forwards",
        "pulse-glow": "pulseGlow 3s ease-in-out infinite",
      },
      keyframes: {
        fadeInUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideInLeft: {
          from: { opacity: "0", transform: "translateX(-12px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        pulseGlow: {
          "0%, 100%": {
            boxShadow: "0 0 20px rgba(99,102,241,0.15)",
          },
          "50%": {
            boxShadow: "0 0 40px rgba(99,102,241,0.3)",
          },
        },
      },
      borderRadius: {
        card: "10px",
        panel: "14px",
        hero: "20px",
      },
      backdropBlur: {
        glass: "16px",
      },
    },
  },
  plugins: [],
};

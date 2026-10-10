/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"] },
      colors: { brand: { DEFAULT: "#818cf8", dark: "#6366f1" } },
      keyframes: {
        float: { "0%,100%": { transform: "translate(0,0)" }, "50%": { transform: "translate(30px,-40px)" } },
        rise: { from: { opacity: 0, transform: "translateY(10px)" }, to: { opacity: 1, transform: "none" } },
      },
      animation: { float: "float 18s ease-in-out infinite", rise: "rise .35s ease both" },
    },
  },
  plugins: [],
};

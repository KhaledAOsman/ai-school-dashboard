/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand purple - derived from the AiSchool logo mark. Full 50-950
        // ramp for real design flexibility (not just a couple of shades).
        brand: {
          50: "#f4f1ff",
          100: "#ebe4ff",
          200: "#d9ccff",
          300: "#bea3ff",
          400: "#9f70ff",
          500: "#8341f7",
          600: "#6d3af2",
          700: "#5a26d6",
          800: "#4a20b0",
          900: "#3d1c8f",
          950: "#250f5e",
        },
        // Brand orange - the logo's motion-arc accent. Reserved for
        // highlights, focus accents, and single data emphasis - never a
        // primary fill.
        accent: {
          50: "#fff6ed",
          100: "#ffe9d3",
          200: "#ffcfa1",
          300: "#ffab5f",
          400: "#ff8a3d",
          500: "#f4650f",
          600: "#e04d0a",
          700: "#b93a0c",
          800: "#943012",
          900: "#782a12",
        },
        // Neutral scale - cool, slightly blue-tinted grays for a refined,
        // modern SaaS feel (matches Linear/Vercel/Stripe-style neutrals)
        // rather than flat/generic Bootstrap-style grays.
        ink: {
          25: "#fcfcfd",
          50: "#f6f7fb",
          100: "#eceef5",
          200: "#dcdfeb",
          300: "#c3c8da",
          400: "#9399b5",
          500: "#555b7a",
          600: "#40455f",
          700: "#2d3149",
          800: "#1d2034",
          900: "#10121f",
          950: "#0a0b14",
        },
        success: {
          50: "#eefcf4",
          100: "#d3f7e2",
          500: "#16a866",
          600: "#0f8a53",
          700: "#0d6d42",
        },
        warning: {
          50: "#fff9ec",
          100: "#fef0c9",
          500: "#d68a0c",
          600: "#b06f09",
          700: "#8a5607",
        },
        danger: {
          50: "#fef1f1",
          100: "#fcdcdc",
          500: "#e0362e",
          600: "#c22a23",
          700: "#9d221c",
        },
      },
      fontFamily: {
        // Brand typeface: DIN Next W1G (Latin + digits, self-hosted from
        // /public/fonts). It has no Arabic glyphs, so Arabic text falls back
        // to Tajawal, a DIN-like Arabic face.
        sans: [
          '"DIN Next W1G"',
          '"Tajawal"',
          '"Segoe UI"',
          "system-ui",
          "sans-serif",
        ],
      },
      // Larger, clearer type scale (SaasAble-style): body 15px, labels 14px.
      fontSize: {
        "2xs": ["0.75rem", { lineHeight: "1.1rem" }],
        xs: ["0.8125rem", { lineHeight: "1.2rem" }],
        sm: ["0.9375rem", { lineHeight: "1.45rem" }],
        base: ["1rem", { lineHeight: "1.6rem" }],
        lg: ["1.125rem", { lineHeight: "1.7rem" }],
        xl: ["1.25rem", { lineHeight: "1.8rem" }],
        "2xl": ["1.625rem", { lineHeight: "2.1rem" }],
        "3xl": ["2rem", { lineHeight: "2.5rem" }],
      },
      boxShadow: {
        // Multi-layer, low-opacity elevation system - soft and cool-toned,
        // tuned for a light UI (each tier stacks a tight + a diffuse shadow).
        xs: "0 1px 2px 0 rgba(29,27,32,0.04)",
        sm: "0 1px 3px 0 rgba(29,27,32,0.06), 0 1px 2px -1px rgba(29,27,32,0.05)",
        md: "0 4px 8px -2px rgba(29,27,32,0.07), 0 2px 4px -2px rgba(29,27,32,0.05)",
        lg: "0 12px 20px -6px rgba(29,27,32,0.10), 0 4px 6px -4px rgba(29,27,32,0.06)",
        xl: "0 24px 40px -8px rgba(29,27,32,0.14), 0 8px 16px -8px rgba(29,27,32,0.08)",
        "glow-brand": "0 0 0 4px rgba(109,58,242,0.14)",
        "card": "0 1px 2px rgba(16,18,31,0.05), 0 4px 12px -4px rgba(16,18,31,0.06)",
        "inner-hairline": "inset 0 0 0 1px rgba(29,27,32,0.06)",
      },
      borderRadius: {
        xl2: "1rem",
        card: "1.25rem",
        xl3: "1.5rem",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "fade-in": { from: { opacity: 0 }, to: { opacity: 1 } },
        "slide-up": { from: { opacity: 0, transform: "translateY(6px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        "scale-in": { from: { opacity: 0, transform: "scale(0.97)" }, to: { opacity: 1, transform: "scale(1)" } },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        "slide-up": "slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #6d3af2 0%, #5a26d6 100%)",
        "mesh-glow":
          "radial-gradient(ellipse 80% 50% at 20% -10%, rgba(109,58,242,0.12), transparent), radial-gradient(ellipse 60% 50% at 100% 10%, rgba(255,138,61,0.10), transparent)",
      },
    },
  },
  plugins: [],
};

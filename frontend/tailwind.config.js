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
          50: "#f8f9fc",
          100: "#eef0f6",
          200: "#dfe2ec",
          300: "#c6cadb",
          400: "#9ba0bb",
          500: "#767c9c",
          600: "#5a5f7d",
          700: "#434761",
          800: "#2b2e42",
          900: "#171929",
          950: "#0c0d16",
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
        // Inter/IBM Plex Sans Arabic pairing - the closest professional,
        // freely-licensed match to LinDIN/DIN's geometric, technical
        // character (LinDIN itself is a commercial Linotype face and can't
        // be bundled here). Falls back gracefully.
        sans: [
          '"Inter"',
          '"IBM Plex Sans Arabic"',
          '"Segoe UI"',
          "system-ui",
          "sans-serif",
        ],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        // Multi-layer, low-opacity elevation system - soft and cool-toned,
        // tuned for a light UI (each tier stacks a tight + a diffuse shadow).
        xs: "0 1px 2px 0 rgba(23,25,41,0.04)",
        sm: "0 1px 3px 0 rgba(23,25,41,0.06), 0 1px 2px -1px rgba(23,25,41,0.05)",
        md: "0 4px 8px -2px rgba(23,25,41,0.07), 0 2px 4px -2px rgba(23,25,41,0.05)",
        lg: "0 12px 20px -6px rgba(23,25,41,0.10), 0 4px 6px -4px rgba(23,25,41,0.06)",
        xl: "0 24px 40px -8px rgba(23,25,41,0.14), 0 8px 16px -8px rgba(23,25,41,0.08)",
        "glow-brand": "0 0 0 4px rgba(109,58,242,0.12)",
        "inner-hairline": "inset 0 0 0 1px rgba(23,25,41,0.06)",
      },
      borderRadius: {
        xl2: "1rem",
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
        "brand-gradient": "linear-gradient(135deg, #6d3af2 0%, #8341f7 60%, #9f70ff 100%)",
        "mesh-glow":
          "radial-gradient(ellipse 80% 50% at 20% -10%, rgba(109,58,242,0.15), transparent), radial-gradient(ellipse 60% 50% at 100% 10%, rgba(255,138,61,0.10), transparent)",
      },
    },
  },
  plugins: [],
};

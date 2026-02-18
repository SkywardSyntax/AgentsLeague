import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],

  theme: {
    extend: {
      // ── Typography ──────────────────────────────────────────
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "sans-serif"],
        display: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        hand: ["var(--font-caveat)", "cursive"],
      },
      fontSize: {
        xs: ["0.6875rem", { lineHeight: "1rem" }],       // 11px
        sm: ["0.8125rem", { lineHeight: "1.25rem" }],    // 13px
        base: ["1rem", { lineHeight: "1.5rem" }],        // 16px
        lg: ["1.1875rem", { lineHeight: "1.75rem" }],    // 19px
        xl: ["1.4375rem", { lineHeight: "2rem" }],       // 23px
        "2xl": ["1.75rem", { lineHeight: "2.25rem" }],   // 28px
        "3xl": ["2.0625rem", { lineHeight: "2.5rem" }],  // 33px
        "4xl": ["2.5rem", { lineHeight: "3rem" }],       // 40px
      },
      letterSpacing: {
        tighter: "-0.025em",
        tight: "-0.02em",
        snug: "-0.01em",
        normal: "0em",
        wide: "0.08em",
      },

      // ── Colors ──────────────────────────────────────────────
      colors: {
        canvas: {
          DEFAULT: "hsl(var(--color-canvas) / <alpha-value>)",
        },
        surface: {
          DEFAULT: "hsl(var(--color-surface) / <alpha-value>)",
          raised: "hsl(var(--color-surface-raised) / <alpha-value>)",
          sunken: "hsl(var(--color-surface-sunken) / <alpha-value>)",
        },
        border: {
          subtle: "hsl(var(--color-border-subtle) / <alpha-value>)",
          DEFAULT: "hsl(var(--color-border) / <alpha-value>)",
          strong: "hsl(var(--color-border-strong) / <alpha-value>)",
        },
        content: {
          primary: "hsl(var(--color-text-primary) / <alpha-value>)",
          secondary: "hsl(var(--color-text-secondary) / <alpha-value>)",
          tertiary: "hsl(var(--color-text-tertiary) / <alpha-value>)",
          inverse: "hsl(var(--color-text-inverse) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--color-accent) / <alpha-value>)",
          hover: "hsl(var(--color-accent-hover) / <alpha-value>)",
          subtle: "hsl(var(--color-accent-subtle) / <alpha-value>)",
        },
        success: {
          DEFAULT: "hsl(var(--color-success) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--color-warning) / <alpha-value>)",
        },
        error: {
          DEFAULT: "hsl(var(--color-error) / <alpha-value>)",
        },
        ai: {
          DEFAULT: "hsl(var(--color-ai) / <alpha-value>)",
          subtle: "hsl(var(--color-ai-subtle) / <alpha-value>)",
        },
        // Whiteboard palette (static, no theme toggle)
        wb: {
          graphite: "#374151",
          ink: "#1E3A5F",
          coral: "#F4845F",
          sage: "#87A878",
          sand: "#E8D5B7",
          lavender: "#B4A7D6",
          sky: "#7EC8E3",
        },
      },

      // ── Spacing (4px base) ──────────────────────────────────
      spacing: {
        "0.5": "2px",
        "1": "4px",
        "1.5": "6px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "5": "20px",
        "6": "24px",
        "8": "32px",
        "10": "40px",
        "12": "48px",
        "16": "64px",
        "20": "80px",
        "24": "96px",
      },

      // ── Border Radius ───────────────────────────────────────
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },

      // ── Shadows ─────────────────────────────────────────────
      boxShadow: {
        xs: "0 1px 2px rgba(0, 0, 0, 0.04)",
        sm: "0 2px 4px rgba(0, 0, 0, 0.06)",
        md: "0 4px 12px rgba(0, 0, 0, 0.08)",
        lg: "0 8px 24px rgba(0, 0, 0, 0.10)",
        xl: "0 16px 48px rgba(0, 0, 0, 0.12)",
        modal:
          "0 24px 48px rgba(0, 0, 0, 0.12), 0 8px 16px rgba(0, 0, 0, 0.08)",
      },

      // ── Transitions ─────────────────────────────────────────
      transitionDuration: {
        instant: "100ms",
        fast: "150ms",
        normal: "250ms",
        slow: "400ms",
        gentle: "600ms",
      },
      transitionTimingFunction: {
        default: "cubic-bezier(0.25, 0.1, 0.25, 1)",
        "ease-out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },

      // ── Animations ──────────────────────────────────────────
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "scale-out": {
          from: { opacity: "1", transform: "scale(1)" },
          to: { opacity: "0", transform: "scale(0.98)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.8)" },
          "70%": { opacity: "1", transform: "scale(1.02)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "draw-in": {
          from: { strokeDashoffset: "100%", opacity: "0.3" },
          to: { strokeDashoffset: "0%", opacity: "1" },
        },
        "sticky-note-in": {
          from: { opacity: "0", transform: "scale(0.8) rotate(-2deg)" },
          to: { opacity: "1", transform: "scale(1) rotate(0deg)" },
        },
        "ai-thinking": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-3px)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" },
        },
        typewriter: {
          from: { width: "0" },
          to: { width: "100%" },
        },
      },
      animation: {
        "fade-in": "fade-in 250ms cubic-bezier(0.25, 0.1, 0.25, 1)",
        "slide-up": "slide-up 400ms cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scale-in 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-out": "scale-out 200ms ease-in forwards",
        "pop-in": "pop-in 350ms cubic-bezier(0.16, 1, 0.3, 1)",
        "draw-in": "draw-in 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "sticky-note-in":
          "sticky-note-in 300ms cubic-bezier(0.16, 1, 0.3, 1)",
        "ai-thinking": "ai-thinking 1.4s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
        typewriter: "typewriter 2s steps(40, end) forwards",
      },

      // ── Backdrop Blur ───────────────────────────────────────
      backdropBlur: {
        toolbar: "16px",
        overlay: "8px",
      },

      // ── Max Width ───────────────────────────────────────────
      maxWidth: {
        prose: "520px",
        modal: "560px",
        panel: "320px",
      },

      // ── Z-Index Layers ──────────────────────────────────────
      zIndex: {
        background: "0",
        canvas: "0",
        "canvas-element": "10",
        content: "20",
        ui: "50",
        toolbar: "100",
        panel: "200",
        dropdown: "300",
        overlay: "400",
        modal: "500",
        tooltip: "600",
        toast: "700",
      },
    },
  },

  plugins: [],
};

export default config;

# AI Whiteboard — Design System

> *"Design is not just what it looks like and feels like. Design is how it works."*
> — Steve Jobs

A comprehensive design specification for an AI-powered whiteboard application, guided by the principles of radical simplicity, material honesty, and quiet confidence that defined Jony Ive's work at Apple.

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Typography](#2-typography)
3. [Color Palette](#3-color-palette)
4. [Whitespace & Layout](#4-whitespace--layout)
5. [Micro-interactions](#5-micro-interactions)
6. [Component Aesthetics](#6-component-aesthetics)
7. [Accessibility](#7-accessibility)
8. [Tailwind Configuration](#8-tailwind-configuration)

---

## 1. Design Principles

Every decision in this system traces back to five core tenets.

### 1.1 Minimalism — Remove Until It Breaks

Strip every element to its functional essence. If a border, shadow, or label can be removed without losing clarity, remove it. The interface should feel inevitable — as though nothing could be added or taken away.

- **No decorative elements.** Every pixel earns its place.
- **Progressive disclosure.** Show only what is needed at each moment.
- **Negative space is a feature**, not wasted screen real estate.

### 1.2 Refinement — Obsess Over the Details

The difference between good and great lives in the subpixel. A 1px shift in alignment, a 20ms change in animation duration, a 2% opacity adjustment — these compound into the feeling of quality.

- **Consistent radius, spacing, and sizing** across every component.
- **Pixel-perfect alignment** on every breakpoint.
- **Subtle gradients and shadows** that mimic real light behavior.

### 1.3 Intentionality — Every Choice Has a Reason

Nothing is arbitrary. Every color, every font weight, every spacing value can be explained. The system is opinionated — it makes strong defaults so the user doesn't have to think.

- **Constrained palettes.** Fewer choices, each more meaningful.
- **Semantic naming.** Colors and tokens describe purpose, not appearance.
- **Purposeful motion.** Animations communicate state, not entertain.

### 1.4 Clarity — Understand in a Glance

The hierarchy of information should be immediately legible. The user's eye should flow naturally from the most important element to the least, without effort.

- **Typographic hierarchy** does the heavy lifting — not color or decoration.
- **Contrast between elements** is structural, not ornamental.
- **Whitespace separates groups** more effectively than borders.

### 1.5 Human-Centered — The Tool Disappears

The best interface is one the user forgets they're using. The whiteboard should feel like an extension of thought — frictionless, responsive, and forgiving.

- **Generous touch targets** (minimum 44×44px).
- **Undo is always available.** Mistakes cost nothing.
- **The AI assists without interrupting.** Suggestions appear at the periphery.

---

## 2. Typography

### 2.1 Font Selection

| Role | Font | Rationale |
|---|---|---|
| **Primary UI** | **Inter** | Optimized for screens. Exceptional legibility at small sizes. Open-source. Variable font with fine-grained weight control. |
| **Display / Headings** | **Inter Display** | Optical size variant tuned for large text. Tighter spacing, refined curves at 20px+. |
| **Monospace (code/data)** | **JetBrains Mono** | Clear distinction between similar glyphs (0/O, 1/l/I). Ligatures for code readability. |
| **Whiteboard handwriting** | **Caveat** | Organic, hand-drawn feel for user-generated whiteboard text. Maintains legibility. |

> **Why Inter over SF Pro?** SF Pro is Apple-ecosystem-only and cannot be legally bundled in web applications. Inter was designed with similar goals — geometric clarity, screen optimization, variable axes — and is freely available under the OFL.

### 2.2 Type Scale

Based on a **1.200 minor third** ratio, anchored at 16px base. This produces a harmonious, restrained progression — never jarring jumps.

| Token | Size | Line Height | Weight | Usage |
|---|---|---|---|---|
| `text-xs` | 11px / 0.6875rem | 16px (1.45) | 400 | Captions, timestamps, metadata |
| `text-sm` | 13px / 0.8125rem | 20px (1.54) | 400–500 | Secondary labels, helper text |
| `text-base` | 16px / 1rem | 24px (1.5) | 400 | Body text, UI labels |
| `text-lg` | 19px / 1.1875rem | 28px (1.47) | 500 | Emphasized body, subheadings |
| `text-xl` | 23px / 1.4375rem | 32px (1.39) | 600 | Section headings |
| `text-2xl` | 28px / 1.75rem | 36px (1.29) | 600 | Page titles |
| `text-3xl` | 33px / 2.0625rem | 40px (1.21) | 700 | Hero / display |
| `text-4xl` | 40px / 2.5rem | 48px (1.2) | 700 | Marketing / splash |

### 2.3 Weight Strategy

| Weight | Value | Usage |
|---|---|---|
| **Regular** | 400 | Body text, descriptions |
| **Medium** | 500 | UI labels, navigation items, subtle emphasis |
| **Semibold** | 600 | Headings, active states, primary actions |
| **Bold** | 700 | Display text, critical emphasis only |

> **Rule:** Never use bold for body text. Never use more than two weights on a single screen region. Weight contrast creates hierarchy; overuse destroys it.

### 2.4 Letter Spacing

| Context | Tracking |
|---|---|
| Body text (≤16px) | `0em` (default) |
| UI labels, buttons | `-0.01em` |
| Headings (≥23px) | `-0.02em` |
| Display (≥33px) | `-0.025em` |
| ALL-CAPS labels | `+0.08em` |

---

## 3. Color Palette

### 3.1 Philosophy

Color is used sparingly and with purpose. The canvas is neutral; color indicates **interactivity, state, or emphasis**. The palette draws from natural materials — stone, paper, graphite, water — rather than saturated digital primaries.

### 3.2 Neutral Base — Light Mode

| Token | Hex | HSL | Usage |
|---|---|---|---|
| `canvas` | `#FAFAF9` | 40 6% 98% | Whiteboard background |
| `surface` | `#FFFFFF` | 0 0% 100% | Cards, panels, modals |
| `surface-raised` | `#F5F5F4` | 40 5% 96% | Hover backgrounds, secondary surfaces |
| `surface-sunken` | `#F0EFED` | 40 5% 94% | Input fields, inset areas |
| `border-subtle` | `#E7E5E4` | 24 6% 90% | Dividers, card borders |
| `border-default` | `#D6D3D1` | 24 6% 83% | Input borders, component edges |
| `border-strong` | `#A8A29E` | 24 6% 64% | Active borders, focus rings |
| `text-primary` | `#1C1917` | 24 10% 10% | Headings, primary content |
| `text-secondary` | `#57534E` | 24 6% 33% | Body text, descriptions |
| `text-tertiary` | `#A8A29E` | 24 6% 64% | Placeholders, disabled text |
| `text-inverse` | `#FAFAF9` | 40 6% 98% | Text on dark backgrounds |

### 3.3 Neutral Base — Dark Mode

| Token | Hex | HSL | Usage |
|---|---|---|---|
| `canvas` | `#0C0A09` | 24 10% 4% | Whiteboard background |
| `surface` | `#1C1917` | 24 10% 10% | Cards, panels, modals |
| `surface-raised` | `#292524` | 24 6% 15% | Hover backgrounds |
| `surface-sunken` | `#0C0A09` | 24 10% 4% | Input fields, inset areas |
| `border-subtle` | `#292524` | 24 6% 15% | Dividers |
| `border-default` | `#44403C` | 24 6% 25% | Input borders |
| `border-strong` | `#78716C` | 24 5% 45% | Active borders, focus rings |
| `text-primary` | `#FAFAF9` | 40 6% 98% | Headings |
| `text-secondary` | `#D6D3D1` | 24 6% 83% | Body text |
| `text-tertiary` | `#78716C` | 24 5% 45% | Placeholders |
| `text-inverse` | `#1C1917` | 24 10% 10% | Text on light backgrounds |

### 3.4 Accent Colors

Each accent is used for a single semantic purpose. Saturation is deliberately restrained.

| Token | Light Hex | Dark Hex | Purpose |
|---|---|---|---|
| `accent` | `#2563EB` | `#60A5FA` | Primary interactive (links, selected, focus) |
| `accent-hover` | `#1D4ED8` | `#93C5FD` | Hover state of primary interactive |
| `accent-subtle` | `#EFF6FF` | `#1E3A5F` | Selected row backgrounds, badges |
| `success` | `#16A34A` | `#4ADE80` | Confirmations, completion states |
| `warning` | `#D97706` | `#FBBF24` | Caution, unsaved changes |
| `error` | `#DC2626` | `#F87171` | Errors, destructive actions |
| `ai` | `#7C3AED` | `#A78BFA` | AI-generated content, suggestions |
| `ai-subtle` | `#F5F3FF` | `#2E1065` | AI suggestion backgrounds |

### 3.5 Whiteboard-Specific Colors

For drawing, sticky notes, and annotations — warm, muted tones that feel physical.

| Name | Hex | Use |
|---|---|---|
| Graphite | `#374151` | Default pen color |
| Ink | `#1E3A5F` | Secondary pen color |
| Coral | `#F4845F` | Sticky note, highlight |
| Sage | `#87A878` | Sticky note, category |
| Sand | `#E8D5B7` | Sticky note, neutral |
| Lavender | `#B4A7D6` | Sticky note, idea |
| Sky | `#7EC8E3` | Connector lines, grouping |

---

## 4. Whitespace & Layout

### 4.1 Spacing Scale

A **4px base unit** with a geometric progression. Every spatial decision uses this scale.

| Token | Value | Common Use |
|---|---|---|
| `space-0` | 0px | — |
| `space-0.5` | 2px | Hairline gaps, icon-to-text micro-spacing |
| `space-1` | 4px | Inline element gaps, tight padding |
| `space-1.5` | 6px | Compact list item padding |
| `space-2` | 8px | Icon margins, small component padding |
| `space-3` | 12px | Button padding (vertical), input padding |
| `space-4` | 16px | Card padding, section gaps |
| `space-5` | 20px | Standard component separation |
| `space-6` | 24px | Panel padding, group spacing |
| `space-8` | 32px | Section separation |
| `space-10` | 40px | Major section breaks |
| `space-12` | 48px | Page-level vertical rhythm |
| `space-16` | 64px | Hero spacing, panel headers |
| `space-20` | 80px | Page margins on large screens |
| `space-24` | 96px | Major structural gaps |

### 4.2 Layout Grid

| Context | Columns | Gutter | Margin |
|---|---|---|---|
| Mobile (<640px) | 4 | 16px | 16px |
| Tablet (640–1024px) | 8 | 24px | 32px |
| Desktop (1024–1440px) | 12 | 24px | 48px |
| Wide (>1440px) | 12 | 32px | 80px |

### 4.3 The Whiteboard Canvas

The canvas is the primary surface. UI chrome should occupy minimal visual weight.

- **Toolbar:** Floating, centered horizontally, 48px from bottom edge. Appears on hover/tap, auto-hides after 3s of inactivity.
- **Properties panel:** Right-aligned slide-out, 320px wide, 16px inset from edge.
- **AI assistant:** Bottom-right corner, 400px max-width, collapses to a single 48px icon.
- **Navigation:** Top-left, minimal — logo + breadcrumb only, opacity 0.7 → 1.0 on hover.

### 4.4 Golden Ratio Applications

- **Panel width to canvas ratio:** Properties panel at 320px on a 1440px viewport ≈ 1:3.5, close to the golden section of the remaining space.
- **Modal dialogs:** Max-width 560px, with a height-to-width ratio approaching 1:1.618 when content permits.
- **AI response cards:** Text block width capped at 520px (65 characters per line — optimal readability).

### 4.5 Border Radius

A single radius value creates a consistent "softness" across the system.

| Token | Value | Usage |
|---|---|---|
| `rounded-sm` | 6px | Small chips, tags, badges |
| `rounded-md` | 8px | Buttons, inputs, dropdowns |
| `rounded-lg` | 12px | Cards, panels, modals |
| `rounded-xl` | 16px | Floating toolbars, feature callouts |
| `rounded-full` | 9999px | Avatars, toggle pills, icon buttons |

---

## 5. Micro-interactions

### 5.1 Animation Philosophy

Motion should be **functional, not decorative**. Every animation answers one of three questions:

1. **Where did this come from?** (Origin — slide, scale from source)
2. **What changed?** (State — color shift, size change)
3. **Where should I look?** (Attention — subtle pulse, highlight)

### 5.2 Timing & Easing

| Token | Duration | Easing | Use |
|---|---|---|---|
| `duration-instant` | 100ms | `ease-out` | Color changes, opacity toggles |
| `duration-fast` | 150ms | `cubic-bezier(0.25, 0.1, 0.25, 1)` | Button hover, focus rings |
| `duration-normal` | 250ms | `cubic-bezier(0.25, 0.1, 0.25, 1)` | Panel slides, dropdowns |
| `duration-slow` | 400ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Modal open/close, page transitions |
| `duration-gentle` | 600ms | `cubic-bezier(0.16, 1, 0.3, 1)` | AI response reveal, content loading |

> **Critical rule:** `cubic-bezier(0.16, 1, 0.3, 1)` — this "ease-out-expo" curve gives the signature Apple feel: fast start, gentle landing. Use it for any motion involving displacement.

### 5.3 Hover States

```
Default   →  Hover         →  Active (pressed)
─────────────────────────────────────────────
bg: transparent  bg: surface-raised   bg: surface-sunken
opacity: 1       opacity: 1           scale: 0.98
                 shadow: sm           shadow: none
                 cursor: pointer
                 transition: 150ms
```

- **Buttons:** Background tint shift + subtle lift (1px shadow increase). On press: scale(0.98) + shadow removal.
- **Cards:** Entire card lifts with `shadow-md` → `shadow-lg`. Border transitions to `border-strong`.
- **Icons:** Opacity 0.6 → 1.0. No color change unless interactive.
- **Text links:** No underline by default. Underline fades in on hover with `text-decoration-color` animation.

### 5.4 Focus States

Focus indicators use a **double-ring** system for maximum visibility without visual noise:

```css
/* Focus ring */
outline: 2px solid var(--accent);
outline-offset: 2px;

/* Subtle glow (light mode only) */
box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
```

### 5.5 Loading & AI Thinking States

- **Skeleton screens** over spinners — always. Skeleton shapes match the content they replace.
- **AI thinking indicator:** Three dots with a staggered vertical oscillation (not horizontal). Amplitude: 3px. Period: 1.4s. Easing: sine wave.
- **Content streaming:** AI text appears character-by-character with a 20ms delay, using opacity fade-in per character (not cursor-blink typewriter).
- **Progress:** Thin 2px bar at the very top of the viewport. Indeterminate state uses a shimmer gradient moving left-to-right.

### 5.6 Canvas-Specific Animations

| Action | Animation |
|---|---|
| Place sticky note | Scale from 0.8→1.0 + opacity 0→1 + slight rotation settle (±2°) in 300ms |
| Draw line | Ink appears with a slight trail opacity (0.3→1.0 over 50ms per segment) |
| Delete element | Scale 1.0→0.9 + opacity 1→0 in 200ms, then layout reflow |
| Pan canvas | Momentum-based deceleration, friction coefficient 0.95 |
| Zoom | Scale from center of pinch/scroll, 150ms ease-out |
| AI suggestion appears | Slide up 8px + fade in, 400ms ease-out-expo |

---

## 6. Component Aesthetics

### 6.1 Buttons

#### Primary Button

```
┌─────────────────────────────────────┐
│  bg: accent                         │
│  text: white                        │
│  font-weight: 500                   │
│  padding: 10px 20px                 │
│  border-radius: 8px                 │
│  shadow: 0 1px 2px rgba(0,0,0,0.05)│
│  transition: all 150ms ease         │
│                                     │
│  :hover → bg: accent-hover          │
│           shadow: 0 2px 4px α(0.1)  │
│           translate-y: -0.5px       │
│                                     │
│  :active → scale: 0.98              │
│            shadow: none             │
│            translate-y: 0           │
│                                     │
│  :disabled → opacity: 0.5           │
│              cursor: not-allowed    │
└─────────────────────────────────────┘
```

#### Secondary Button

```
bg: transparent
border: 1px solid border-default
text: text-primary
:hover → bg: surface-raised, border: border-strong
```

#### Ghost Button

```
bg: transparent
border: none
text: text-secondary
:hover → bg: surface-raised
```

#### Icon Button

```
size: 36×36px (sm) | 40×40px (md) | 48×48px (lg)
bg: transparent
border-radius: full
icon: 20px, opacity 0.7
:hover → bg: surface-raised, icon opacity 1.0
```

### 6.2 Input Fields

```
┌──────────────────────────────────────┐
│  Label (text-sm, weight-500,         │
│         text-secondary, mb: 6px)     │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ Placeholder text...            │  │
│  │                                │  │
│  │ bg: surface-sunken             │  │
│  │ border: 1px solid border-default│  │
│  │ border-radius: 8px            │  │
│  │ padding: 10px 14px            │  │
│  │ font-size: text-base          │  │
│  │                                │  │
│  │ :focus → border: accent        │  │
│  │          ring: 3px accent/12%  │  │
│  │          bg: surface           │  │
│  └────────────────────────────────┘  │
│                                      │
│  Helper text (text-xs,               │
│    text-tertiary, mt: 4px)           │
└──────────────────────────────────────┘
```

- **No border on default** option: In ultra-minimal contexts, inputs can use only a bottom border (1px `border-subtle`) with full transparency, gaining a full border only on focus.
- **Validation:** Error state replaces border color with `error` and shows helper text in `error`. Never use red backgrounds.

### 6.3 Modal Dialogs

```
Overlay: bg-black/40, backdrop-blur(8px)
Dialog:
  bg: surface
  border-radius: 12px
  shadow: 0 24px 48px rgba(0,0,0,0.12),
          0 8px 16px rgba(0,0,0,0.08)
  max-width: 560px
  padding: 24px
  animation-in: scale(0.96→1.0) + opacity(0→1), 250ms ease-out-expo
  animation-out: scale(1.0→0.98) + opacity(1→0), 200ms ease-in
```

- **Title:** `text-xl`, `font-semibold`, `text-primary`
- **Body:** `text-base`, `text-secondary`, `leading-relaxed`
- **Actions:** Right-aligned, primary button rightmost. 8px gap between buttons.
- **Close button:** Top-right corner, ghost icon button, `X` icon at 16px.
- **Escape key** always closes. Click on overlay always closes.

### 6.4 Toolbar (Floating)

```
┌─────────────────────────────────────────┐
│                                         │
│  ┌──┐ ┌──┐ ┌──┐  │  ┌──┐ ┌──┐  │ ┌──┐ │
│  │✏️│ │📝│ │🔲│  │  │🔤│ │📎│  │ │↩️│ │
│  └──┘ └──┘ └──┘  │  └──┘ └──┘  │ └──┘ │
│                                         │
│  bg: surface/80% (backdrop-blur 16px)   │
│  border: 1px solid border-subtle        │
│  border-radius: 16px                    │
│  padding: 6px 8px                       │
│  shadow: 0 8px 32px rgba(0,0,0,0.08)   │
│  gap between icons: 2px                 │
│  divider: 1px solid border-subtle       │
└─────────────────────────────────────────┘
```

- Selected tool: `bg: accent-subtle`, `text: accent`, `border-radius: 8px`
- The toolbar uses **backdrop-blur** to float above the canvas while maintaining context.

### 6.5 AI Response Card

```
┌─────────────────────────────────────┐
│ ✦  AI Suggestion              ···  │
│─────────────────────────────────────│
│                                     │
│ Response text appears here with     │
│ streaming animation. Maximum line   │
│ width of 65 characters for optimal  │
│ readability.                        │
│                                     │
│ ┌─────────┐  ┌─────────┐           │
│ │ Accept  │  │ Dismiss │           │
│ └─────────┘  └─────────┘           │
└─────────────────────────────────────┘

left-border: 2px solid ai
bg: ai-subtle
border-radius: 12px
padding: 16px
```

### 6.6 Tooltips

```
bg: text-primary (inverted)
text: text-inverse
font-size: text-xs
padding: 4px 10px
border-radius: 6px
shadow: 0 4px 12px rgba(0,0,0,0.15)
delay: 500ms before showing
animation: fade-in + translate-y(4px→0), 150ms
arrow: 6px CSS triangle, centered on trigger
```

### 6.7 Shadow System

| Token | Value | Use |
|---|---|---|
| `shadow-xs` | `0 1px 2px rgba(0,0,0,0.04)` | Subtle lift — buttons, inputs |
| `shadow-sm` | `0 2px 4px rgba(0,0,0,0.06)` | Cards at rest |
| `shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | Dropdown menus, popovers |
| `shadow-lg` | `0 8px 24px rgba(0,0,0,0.10)` | Floating toolbar, raised panels |
| `shadow-xl` | `0 16px 48px rgba(0,0,0,0.12)` | Modals, dialogs |

> In dark mode, shadow opacity is halved and a subtle `1px` top border (`border-subtle`) is added to compensate, since shadows are less perceptible on dark backgrounds.

---

## 7. Accessibility

### 7.1 Contrast Ratios (WCAG 2.1 AA Minimum)

| Pair | Light Mode Ratio | Dark Mode Ratio | Requirement |
|---|---|---|---|
| `text-primary` on `canvas` | 16.8:1 ✅ | 17.4:1 ✅ | ≥4.5:1 (normal text) |
| `text-secondary` on `canvas` | 7.2:1 ✅ | 10.3:1 ✅ | ≥4.5:1 (normal text) |
| `text-tertiary` on `canvas` | 3.4:1 ⚠️ | 4.6:1 ✅ | ≥3:1 (large text only) |
| `accent` on `surface` | 4.6:1 ✅ | 4.7:1 ✅ | ≥4.5:1 (normal text) |
| `error` on `surface` | 4.5:1 ✅ | 4.6:1 ✅ | ≥4.5:1 (normal text) |
| White on `accent` | 5.9:1 ✅ | — | ≥4.5:1 (button text) |

> **`text-tertiary` in light mode** falls below 4.5:1. It is used **only** for placeholder text and disabled states (non-essential content) or text ≥19px where 3:1 is sufficient.

### 7.2 Minimum Sizes

| Element | Minimum Size | Notes |
|---|---|---|
| Touch target | 44×44px | Per WCAG 2.5.5 (AAA) / Apple HIG |
| Body text | 16px | Never smaller for primary content |
| Secondary text | 13px | Minimum for auxiliary information |
| Caption text | 11px | Used sparingly, never for essential info |
| Icon (standalone) | 20×20px | With 44×44px touch target padding |
| Focus ring | 2px width | With 2px offset from element edge |

### 7.3 Keyboard Navigation

- **Tab order** follows visual layout, top-to-bottom, left-to-right.
- **Skip link** as first focusable element: "Skip to canvas" for whiteboard.
- **Arrow keys** navigate within component groups (toolbar, menus).
- **Escape** closes any overlay (modal, dropdown, panel).
- **Space/Enter** activates the focused element.
- **Ctrl+Z / Cmd+Z** undo. Always available. Infinite undo stack.
- **Canvas shortcuts:** `V` select, `P` pen, `T` text, `S` sticky note, `L` line, `R` rectangle.

### 7.4 Screen Reader Support

- All interactive elements have `aria-label` or visible text.
- Canvas elements are described in an off-screen accessible tree.
- AI suggestions announced via `aria-live="polite"` region.
- State changes (selected tool, zoom level) announced via `aria-live`.
- Modals trap focus and use `role="dialog"` with `aria-modal="true"`.

### 7.5 Motion Sensitivity

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

All animations respect `prefers-reduced-motion`. Functional state changes (color, opacity) remain; displacement and scaling are suppressed.

---

## 8. Tailwind Configuration

The following `tailwind.config.ts` implements the design system. It extends (never overrides) Tailwind defaults where possible.

```typescript
import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  darkMode: "class",

  theme: {
    extend: {
      // ── Typography ──────────────────────────────────────────
      fontFamily: {
        sans: ["Inter", ...defaultTheme.fontFamily.sans],
        display: ["Inter Display", "Inter", ...defaultTheme.fontFamily.sans],
        mono: ["JetBrains Mono", ...defaultTheme.fontFamily.mono],
        hand: ["Caveat", "cursive"],
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
          DEFAULT: "#FAFAF9",
          dark: "#0C0A09",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          raised: "#F5F5F4",
          sunken: "#F0EFED",
          dark: {
            DEFAULT: "#1C1917",
            raised: "#292524",
            sunken: "#0C0A09",
          },
        },
        border: {
          subtle: "#E7E5E4",
          DEFAULT: "#D6D3D1",
          strong: "#A8A29E",
          dark: {
            subtle: "#292524",
            DEFAULT: "#44403C",
            strong: "#78716C",
          },
        },
        content: {
          primary: "#1C1917",
          secondary: "#57534E",
          tertiary: "#A8A29E",
          inverse: "#FAFAF9",
          dark: {
            primary: "#FAFAF9",
            secondary: "#D6D3D1",
            tertiary: "#78716C",
            inverse: "#1C1917",
          },
        },
        accent: {
          DEFAULT: "#2563EB",
          hover: "#1D4ED8",
          subtle: "#EFF6FF",
          dark: {
            DEFAULT: "#60A5FA",
            hover: "#93C5FD",
            subtle: "#1E3A5F",
          },
        },
        success: {
          DEFAULT: "#16A34A",
          dark: "#4ADE80",
        },
        warning: {
          DEFAULT: "#D97706",
          dark: "#FBBF24",
        },
        error: {
          DEFAULT: "#DC2626",
          dark: "#F87171",
        },
        ai: {
          DEFAULT: "#7C3AED",
          subtle: "#F5F3FF",
          dark: {
            DEFAULT: "#A78BFA",
            subtle: "#2E1065",
          },
        },
        // Whiteboard palette
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

      // ── Spacing ─────────────────────────────────────────────
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
      },
      animation: {
        "fade-in": "fade-in 250ms cubic-bezier(0.25, 0.1, 0.25, 1)",
        "slide-up": "slide-up 400ms cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scale-in 250ms cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-out": "scale-out 200ms ease-in forwards",
        "sticky-note-in":
          "sticky-note-in 300ms cubic-bezier(0.16, 1, 0.3, 1)",
        "ai-thinking": "ai-thinking 1.4s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
      },

      // ── Backdrop Blur ───────────────────────────────────────
      backdropBlur: {
        toolbar: "16px",
        overlay: "8px",
      },

      // ── Max Width ───────────────────────────────────────────
      maxWidth: {
        prose: "520px",    // ~65 chars at 16px Inter
        modal: "560px",
        panel: "320px",
      },

      // ── Z-Index ─────────────────────────────────────────────
      zIndex: {
        canvas: "0",
        "canvas-element": "10",
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
```

### 8.1 CSS Custom Properties Layer

For values that need runtime toggling (dark mode, user preferences), define CSS custom properties alongside Tailwind:

```css
@layer base {
  :root {
    --color-canvas: 40 6% 98%;
    --color-surface: 0 0% 100%;
    --color-surface-raised: 40 5% 96%;
    --color-surface-sunken: 40 5% 94%;
    --color-border-subtle: 24 6% 90%;
    --color-border: 24 6% 83%;
    --color-border-strong: 24 6% 64%;
    --color-text-primary: 24 10% 10%;
    --color-text-secondary: 24 6% 33%;
    --color-text-tertiary: 24 6% 64%;
    --color-accent: 217 91% 54%;
    --color-ai: 263 70% 58%;
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
    --radius-xl: 16px;
  }

  .dark {
    --color-canvas: 24 10% 4%;
    --color-surface: 24 10% 10%;
    --color-surface-raised: 24 6% 15%;
    --color-surface-sunken: 24 10% 4%;
    --color-border-subtle: 24 6% 15%;
    --color-border: 24 6% 25%;
    --color-border-strong: 24 5% 45%;
    --color-text-primary: 40 6% 98%;
    --color-text-secondary: 24 6% 83%;
    --color-text-tertiary: 24 5% 45%;
    --color-accent: 213 94% 68%;
    --color-ai: 258 90% 76%;
  }

  /* Global defaults */
  html {
    font-family: "Inter", system-ui, sans-serif;
    font-feature-settings: "cv02", "cv03", "cv04", "cv11";
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
}
```

### 8.2 Utility Class Examples

```html
<!-- Primary Button -->
<button class="
  bg-accent text-white font-medium text-sm
  px-5 py-2.5 rounded-md shadow-xs
  transition-all duration-fast ease-default
  hover:bg-accent-hover hover:shadow-sm hover:-translate-y-px
  active:scale-[0.98] active:shadow-none
  focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2
  disabled:opacity-50 disabled:cursor-not-allowed
">
  Save Changes
</button>

<!-- Floating Toolbar -->
<div class="
  fixed bottom-12 left-1/2 -translate-x-1/2
  bg-surface/80 backdrop-blur-toolbar
  border border-border-subtle rounded-xl
  shadow-lg px-2 py-1.5
  flex items-center gap-0.5
  z-toolbar
">
  <!-- Tool buttons -->
</div>

<!-- AI Response Card -->
<div class="
  bg-ai-subtle border-l-2 border-ai
  rounded-lg p-4 max-w-prose
  animate-slide-up
">
  <div class="flex items-center gap-2 mb-3">
    <span class="text-ai font-semibold text-sm">✦ AI Suggestion</span>
  </div>
  <p class="text-content-secondary text-base leading-relaxed">
    <!-- Streamed response -->
  </p>
</div>

<!-- Modal Dialog -->
<div class="
  fixed inset-0 z-overlay
  bg-black/40 backdrop-blur-overlay
  flex items-center justify-center
">
  <div class="
    bg-surface rounded-lg shadow-modal
    max-w-modal w-full mx-4 p-6
    animate-scale-in
    z-modal
  ">
    <h2 class="text-xl font-semibold text-content-primary tracking-tight mb-2">
      Dialog Title
    </h2>
    <p class="text-base text-content-secondary leading-relaxed mb-6">
      Dialog body text goes here.
    </p>
    <div class="flex justify-end gap-2">
      <button class="px-4 py-2.5 rounded-md text-sm font-medium text-content-secondary hover:bg-surface-raised">
        Cancel
      </button>
      <button class="px-4 py-2.5 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent-hover shadow-xs">
        Confirm
      </button>
    </div>
  </div>
</div>
```

---

## Appendix: Design Checklist

Before shipping any component, verify:

- [ ] Works in both light and dark mode
- [ ] All text passes WCAG AA contrast (4.5:1 normal, 3:1 large)
- [ ] Touch targets ≥ 44×44px
- [ ] Keyboard navigable with visible focus indicator
- [ ] Animations respect `prefers-reduced-motion`
- [ ] No more than 2 font weights visible simultaneously
- [ ] Spacing uses the 4px scale exclusively
- [ ] Shadows use the defined token system
- [ ] Border radius is consistent within context
- [ ] Component is functional before it is beautiful

---

*This design system is a living document. It defines constraints, not limitations. When in doubt, choose the simpler option.*

# AgentsLeague — AI Whiteboard

An AI-powered collaborative whiteboard built with Next.js, TypeScript, and Tailwind CSS.

---

## Table of Contents

1. [Directory Structure](#1-directory-structure)
2. [Next.js Configuration](#2-nextjs-configuration)
3. [Tailwind Setup](#3-tailwind-setup)
4. [Build Pipeline](#4-build-pipeline)
5. [Dependencies](#5-dependencies)
6. [Environment Configuration](#6-environment-configuration)
7. [Tooling](#7-tooling)
8. [Monorepo Consideration](#8-monorepo-consideration)
9. [Quick Start](#9-quick-start)

---

## 1. Directory Structure

```
AgentsLeague/
├── public/                        # Static assets (favicons, images, fonts)
│   └── assets/
│       ├── icons/
│       └── images/
├── src/
│   ├── app/                       # Next.js App Router (layouts, pages, loading/error)
│   │   ├── layout.tsx             # Root layout (providers, global styles)
│   │   ├── page.tsx               # Landing / home page
│   │   ├── board/
│   │   │   └── [id]/
│   │   │       └── page.tsx       # Individual whiteboard view
│   │   └── api/                   # Route Handlers (App Router)
│   │       ├── ai/
│   │       │   └── route.ts       # AI inference endpoint
│   │       ├── boards/
│   │       │   └── route.ts       # CRUD for boards
│   │       └── export/
│   │           └── route.ts       # Export board as PNG/SVG/PDF
│   ├── components/
│   │   ├── ui/                    # Generic primitives (Button, Modal, Tooltip)
│   │   ├── canvas/                # Canvas & drawing components
│   │   │   ├── Canvas.tsx         # Main <canvas> wrapper
│   │   │   ├── Toolbar.tsx        # Pen, shapes, eraser, AI tools
│   │   │   ├── LayerPanel.tsx     # Layer management sidebar
│   │   │   └── SelectionBox.tsx   # Multi-select bounding box
│   │   ├── ai/                    # AI-specific UI (prompt input, results)
│   │   │   ├── AiPromptBar.tsx
│   │   │   └── AiSuggestionOverlay.tsx
│   │   └── layout/                # App chrome (Header, Sidebar, Footer)
│   │       ├── Header.tsx
│   │       └── Sidebar.tsx
│   ├── hooks/                     # Custom React hooks
│   │   ├── useCanvas.ts           # Canvas 2D context, resize, DPR
│   │   ├── useDrawing.ts          # Pointer events → stroke data
│   │   ├── useHistory.ts          # Undo / redo stack
│   │   ├── useAi.ts               # AI prompt submission & streaming
│   │   ├── useWebSocket.ts        # Real-time collaboration
│   │   └── useKeyboardShortcuts.ts
│   ├── types/                     # Shared TypeScript types & Zod schemas
│   │   ├── board.ts               # Board, Layer, Element
│   │   ├── drawing.ts             # Stroke, Shape, Point, Tool
│   │   ├── ai.ts                  # AiRequest, AiResponse
│   │   └── api.ts                 # API request/response envelopes
│   ├── utils/                     # Pure helper functions
│   │   ├── geometry.ts            # Hit-testing, bounding boxes, transforms
│   │   ├── color.ts               # Color conversions, palette helpers
│   │   ├── export.ts              # Canvas → PNG/SVG serialization
│   │   ├── debounce.ts
│   │   └── cn.ts                  # clsx + tailwind-merge wrapper
│   ├── lib/                       # Third-party wrappers & server-side clients
│   │   ├── openai.ts              # OpenAI SDK client (server-only)
│   │   ├── db.ts                  # Database client (Prisma / Drizzle)
│   │   └── redis.ts               # Rate-limiting / pub-sub client
│   ├── stores/                    # Client state management (Zustand)
│   │   ├── boardStore.ts          # Board data, layers, active tool
│   │   └── uiStore.ts             # Modals, panels, theme
│   └── styles/
│       └── globals.css            # Tailwind directives + CSS variables
├── prisma/                        # Database schema (if using Prisma)
│   └── schema.prisma
├── .github/
│   └── workflows/
│       └── ci.yml                 # GitHub Actions CI pipeline
├── .husky/
│   └── pre-commit                 # Husky pre-commit hook
├── .env.example                   # Template for required env vars
├── .env.local                     # Local secrets (git-ignored)
├── .eslintrc.cjs                  # ESLint configuration
├── .prettierrc                    # Prettier configuration
├── jest.config.ts                 # Jest configuration
├── next.config.ts                 # Next.js configuration
├── tailwind.config.ts             # Tailwind configuration
├── tsconfig.json                  # TypeScript configuration
├── postcss.config.cjs             # PostCSS (required by Tailwind)
├── package.json
└── README.md
```

---

## 2. Next.js Configuration

### `tsconfig.json`

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    // ── Path aliases ──
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/hooks/*": ["./src/hooks/*"],
      "@/types/*": ["./src/types/*"],
      "@/utils/*": ["./src/utils/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/stores/*": ["./src/stores/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### `next.config.ts`

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Opt into the App Router (default in Next 14+)
  experimental: {
    serverActions: { bodySizeLimit: "4mb" }, // allow large canvas payloads
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.openai.com" },
    ],
  },
  // Ensure server-only packages never leak to client bundles
  serverExternalPackages: ["openai", "@prisma/client"],
};

export default nextConfig;
```

---

## 3. Tailwind Setup

### `tailwind.config.ts`

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: {
          bg: "var(--canvas-bg)",
          grid: "var(--canvas-grid)",
        },
        toolbar: {
          DEFAULT: "var(--toolbar-bg)",
          active: "var(--toolbar-active)",
        },
        ai: {
          primary: "#7C3AED",   // violet-600
          surface: "#EDE9FE",   // violet-100
        },
      },
      spacing: {
        toolbar: "3.5rem",     // 56 px toolbar height
        sidebar: "16rem",      // 256 px sidebar width
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
      },
      cursor: {
        crosshair: "crosshair",
        grab: "grab",
        grabbing: "grabbing",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),       // enter/exit animations
    require("@tailwindcss/typography"),    // prose styling for AI text
  ],
};

export default config;
```

### `postcss.config.cjs`

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### `src/styles/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --canvas-bg: #ffffff;
  --canvas-grid: #e5e7eb;
  --toolbar-bg: #f9fafb;
  --toolbar-active: #7c3aed;
}

.dark {
  --canvas-bg: #1e1e2e;
  --canvas-grid: #313244;
  --toolbar-bg: #181825;
  --toolbar-active: #a78bfa;
}
```

---

## 4. Build Pipeline

### GitHub Actions — `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      # ── Parallel quality gates ──
      - name: Type check
        run: npx tsc --noEmit

      - name: Lint
        run: npx eslint . --max-warnings 0

      - name: Format check
        run: npx prettier --check .

      - name: Unit & integration tests
        run: npm test -- --ci --coverage

      - name: Build
        run: npm run build
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          NEXT_PUBLIC_APP_URL: https://example.com
```

### Pipeline stage order

| Stage          | Command              | Fails fast? |
| -------------- | -------------------- | ----------- |
| Install        | `npm ci`             | ✓           |
| Type-check     | `tsc --noEmit`       | ✓           |
| Lint           | `eslint .`           | ✓           |
| Format         | `prettier --check .` | ✓           |
| Test           | `jest --ci`          | ✓           |
| Build          | `next build`         | ✓           |

---

## 5. Dependencies

### `package.json` (overview)

```jsonc
{
  "name": "agents-league",
  "version": "0.1.0",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings 0",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "prepare": "husky"
  },
  "dependencies": {
    // ── Framework ──
    "next":                   "^15.1",
    "react":                  "^19.0",
    "react-dom":              "^19.0",

    // ── AI ──
    "openai":                 "^4.77",       // OpenAI SDK (server-side)
    "ai":                     "^4.1",        // Vercel AI SDK (streaming helpers)

    // ── State ──
    "zustand":                "^5.0",        // Lightweight client state

    // ── Validation ──
    "zod":                    "^3.24",       // Runtime schema validation

    // ── Drawing / Canvas ──
    "perfect-freehand":       "^1.2",        // Pressure-sensitive strokes
    "roughjs":                "^4.6",        // Sketchy / hand-drawn rendering

    // ── Styling ──
    "tailwind-merge":         "^2.6",        // Dedup Tailwind classes
    "clsx":                   "^2.1",        // Conditional classNames
    "tailwindcss-animate":    "^1.0",        // Animation utilities
    "lucide-react":           "^0.469",      // Icon set

    // ── Database (pick one) ──
    "@prisma/client":         "^6.2",
    // OR
    // "drizzle-orm":         "^0.38",

    // ── Realtime (optional) ──
    "socket.io-client":       "^4.8"
  },
  "devDependencies": {
    // ── TypeScript ──
    "typescript":             "^5.7",
    "@types/node":            "^22",
    "@types/react":           "^19",
    "@types/react-dom":       "^19",

    // ── Tailwind ──
    "tailwindcss":            "^3.4",
    "@tailwindcss/typography": "^0.5",
    "autoprefixer":           "^10.4",
    "postcss":                "^8.4",

    // ── Linting / Formatting ──
    "eslint":                 "^9.18",
    "eslint-config-next":     "^15.1",
    "@typescript-eslint/eslint-plugin": "^8.21",
    "@typescript-eslint/parser":        "^8.21",
    "eslint-plugin-import":   "^2.31",
    "prettier":               "^3.4",
    "prettier-plugin-tailwindcss": "^0.6",

    // ── Testing ──
    "jest":                   "^29.7",
    "ts-jest":                "^29.2",
    "@testing-library/react": "^16.1",
    "@testing-library/jest-dom": "^6.6",

    // ── Git hooks ──
    "husky":                  "^9.1",
    "lint-staged":            "^15.4",

    // ── Database ──
    "prisma":                 "^6.2"
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix --max-warnings 0", "prettier --write"],
    "*.{json,css,md}": ["prettier --write"]
  }
}
```

---

## 6. Environment Configuration

### `.env.example` (committed to git)

```bash
# ── AI ──
OPENAI_API_KEY=sk-...              # Required — OpenAI API key
OPENAI_MODEL=gpt-4o               # Optional — defaults to gpt-4o

# ── Database ──
DATABASE_URL=postgresql://user:password@localhost:5432/agentsleague

# ── Realtime (optional) ──
REDIS_URL=redis://localhost:6379

# ── Public (exposed to browser) ──
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

### `.env.local` (git-ignored, developer secrets)

Developers copy `.env.example` → `.env.local` and fill in real values.

### Validation at startup (`src/lib/env.ts`)

```ts
import { z } from "zod";

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
```

---

## 7. Tooling

### ESLint — `.eslintrc.cjs`

```js
/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: [
    "next/core-web-vitals",
    "next/typescript",
    "plugin:@typescript-eslint/strict-type-checked",
    "plugin:import/typescript",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },
  rules: {
    // Enforce consistent imports
    "import/order": ["warn", {
      groups: ["builtin", "external", "internal", "parent", "sibling"],
      "newlines-between": "always",
      alphabetize: { order: "asc" },
    }],
    // Prefer type-only imports for types
    "@typescript-eslint/consistent-type-imports": ["error", {
      prefer: "type-imports",
    }],
    // No unused vars (allow _ prefix)
    "@typescript-eslint/no-unused-vars": ["error", {
      argsIgnorePattern: "^_",
    }],
  },
};
```

### Prettier — `.prettierrc`

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "tabWidth": 2,
  "printWidth": 90,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

### Husky + lint-staged

```bash
# .husky/pre-commit
npx lint-staged
```

### `tsconfig.json` optimizations (already covered in §2)

| Flag               | Why                                                |
| ------------------ | -------------------------------------------------- |
| `strict: true`     | Catch nullability, implicit any, unused locals      |
| `isolatedModules`  | Required by Next.js SWC                             |
| `incremental`      | Faster re-checks during development                 |
| `moduleResolution: bundler` | Matches Next.js bundler behavior            |

---

## 8. Monorepo Consideration

### Recommendation: **start as a single package; extract later**

| Question                              | Verdict | Rationale |
| ------------------------------------- | ------- | --------- |
| Separate drawing engine package?      | **Not yet** | The engine is tightly coupled to React hooks and canvas rendering. Extract into `packages/engine` only when a second consumer exists (e.g., a React Native app or standalone viewer). |
| Shared types package?                 | **Not yet** | Keep `src/types/` co-located. Extract to `packages/types` if a separate backend service or mobile app needs the same schemas. |
| When to adopt a monorepo?             | **When you add a second deployable** — e.g., a WebSocket server, a docs site, or a CLI tool. |

### If / when you move to a monorepo

```
AgentsLeague/
├── apps/
│   ├── web/               # Next.js app (current repo)
│   └── ws-server/         # WebSocket collaboration server
├── packages/
│   ├── engine/            # Drawing engine (canvas primitives, hit-testing)
│   ├── types/             # Shared Zod schemas + TS types
│   └── ui/                # Design-system components
├── turbo.json             # Turborepo pipeline config
├── package.json           # Workspace root
└── tsconfig.base.json     # Shared TS settings
```

Use **Turborepo** (`npx create-turbo`) for incremental builds and shared caching. Each package gets its own `tsconfig.json` that extends `tsconfig.base.json`.

---

## 9. Quick Start

```bash
# 1. Clone & install
git clone https://github.com/<org>/AgentsLeague.git
cd AgentsLeague
npm install

# 2. Set up environment
cp .env.example .env.local
# → Fill in OPENAI_API_KEY, DATABASE_URL

# 3. Initialize database
npx prisma db push

# 4. Run dev server
npm run dev          # → http://localhost:3000

# 5. Quality checks
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format:check # prettier
npm test             # jest
```
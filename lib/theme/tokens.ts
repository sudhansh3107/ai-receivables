/**
 * ==========================================================
 * VSB Labs Design Tokens
 * ----------------------------------------------------------
 * Single Source of Truth
 *
 * Rules
 * • Never hardcode colors.
 * • Always import from "@/lib/theme/tokens".
 * • Executive-first design language.
 * ==========================================================
 */

export const tokens = {
  // ========================================================
  // Foundation Colors
  // ========================================================

  colors: {
    white: "#FFFFFF",
    black: "#000000",

    brown: "#8F6B4A",
    brownHover: "#7A5C40",

    gold: "#C9A66B",

    green: "#6E8F63",

    red: "#C96D55",

    peach: "#E6D1C4",

    charcoal: "#1A1A1A",

    charcoalSoft: "#2C2B29",

    warmGray: "#6B645C",

    taupe: "#A89F93",

    beige: "#E6DED4",

    offWhite: "#F7F3EF",

    background: "#FAF6F3",

    card: "#FFFFFF",

    cardWarm: "#F2EBE2",

    section: "#EEE4D6",
  },

  // ========================================================
  // Semantic
  // ========================================================

  semantic: {
    background: "#FAF6F3",

    surface: "#FFFFFF",

    surfaceSecondary: "#F7F3EF",

    surfaceWarm: "#F2EBE2",

    section: "#EEE4D6",

    hover: "#F2EBE2",

    border: "#E6DED4",

    divider: "#E3D8CC",

    borderSoft: "#EFE8E0",

    textPrimary: "#1A1A1A",

    textSecondary: "#4B4B4B",

    textMuted: "#7D7D7D",

    textDisabled: "#A8A8A8",

    success: "#6E8F63",

    warning: "#C96D55",

    danger: "#C96D55",

    info: "#4F79B8",
  },

  // ========================================================
  // Brand
  // ========================================================

  brand: {
    company: "VSB Labs",

    primary: "#8F6B4A",

    primaryHover: "#7A5C40",

    premium: "#C9A66B",

    logo: "#8F6B4A",
  },

  // ========================================================
  // Digital Employees
  // ========================================================

  employees: {
    orion: {
      name: "Orion",

      accent: "#C9A66B",

      background: "#F7F3EF",

      glow: "rgba(201,166,107,.18)",
    },

    atlas: {
      name: "Atlas",

      accent: "#6E8F63",

      background: "#E6F2E5",

      glow: "rgba(110,143,99,.18)",
    },

    lyra: {
      name: "Lyra",

      accent: "#8A7B96",

      background: "#F3EFF7",

      glow: "rgba(138,123,150,.18)",
    },

    nova: {
      name: "Nova",

      accent: "#C96D55",

      background: "#FBE8E6",

      glow: "rgba(201,109,85,.18)",
    },

    sentinel: {
      name: "Sentinel",

      accent: "#4F79B8",

      background: "#E7F0FA",

      glow: "rgba(79,121,184,.18)",
    },
  },

  // ========================================================
  // Trust Architecture
  // ========================================================

  trust: {
    level1: "#A8A8A8",

    level2: "#A89F93",

    level3: "#C9A66B",

    level4: "#6E8F63",

    level5: "#8F6B4A",
  },

  // ========================================================
  // Status
  // ========================================================

  status: {
    completed: {
      background: "#E6F2E5",

      text: "#5B8A57",
    },

    overdue: {
      background: "#FBE8E6",

      text: "#C96D55",
    },

    pending: {
      background: "#F7EAD6",

      text: "#A56B20",
    },

    info: {
      background: "#E7F0FA",

      text: "#4F79B8",
    },
  },

  // ========================================================
  // Charts
  // ========================================================

  charts: {
    collections: "#6E8F63",

    outstanding: "#C9A66B",

    overdue: "#C96D55",

    approvals: "#8F6B4A",

    grid: "#E6DED4",

    axis: "#A89F93",
  },

  // ========================================================
  // Gradients
  // ========================================================

  gradients: {
    primary:
      "linear-gradient(135deg,#8F6B4A,#3E2E1F)",

    sidebar:
      "linear-gradient(180deg,#1A1A1A,#0F0F0F)",

    card:
      "linear-gradient(180deg,#FAF6F3,#F2EBE2)",

    premium:
      "linear-gradient(135deg,#C9A66B,#A7894E)",
  },

  // ========================================================
  // Typography
  // ========================================================

  typography: {
    display: "3.5rem",

    h1: "2.5rem",

    h2: "2rem",

    h3: "1.5rem",

    title: "1.125rem",

    body: "1rem",

    caption: "0.875rem",

    label: "0.75rem",

    // Recurring overline/eyebrow pattern (uppercase, tracked-wide
    // section labels) used across headquarters/* — previously
    // retyped ad hoc in each component.
    eyebrow: {
      fontSize: "13px",
      fontWeight: 600,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
    },
  },

  // ========================================================
  // Radius
  // ========================================================

  radius: {
    sm: "8px",

    md: "12px",

    lg: "20px",

    xl: "28px",

    "2xl": "36px",

    full: "9999px",

    // Ordinary containers (list rows, chips, small panels) —
    // Tailwind's `rounded-2xl` (16px) in practice, previously
    // unrepresented in the scale between md(12) and lg(20).
    container: "16px",

    // Signature dashboard card radius. Canonically 28px — equal
    // to `xl` today by design, but kept as its own named token
    // because it represents a distinct role (the headquarters
    // card shell) that may diverge from the generic `xl` step
    // later. Also resolves the 30px/26px drift found across
    // MissionCard/ActivityFeed/DecisionFeed/AIInsight/MetricsPanel.
    card: "28px",
  },

  // ========================================================
  // Shadows
  // ========================================================

  shadows: {
    sm: "0 2px 8px rgba(26,26,26,.05)",

    md: "0 8px 24px rgba(26,26,26,.08)",

    lg: "0 20px 60px rgba(26,26,26,.12)",

    premium: "0 24px 80px rgba(143,107,74,.15)",

    // Consolidated warm hover glow — reuses premium's exact hue
    // (143,107,74) at a smaller offset/blur suited to routine
    // hover states, replacing the four near-duplicate warm
    // shadows found in ActivityItem/DecisionItem/StatCard.
    hover: "0 10px 28px rgba(143,107,74,0.12)",
  },

  // ========================================================
  // Motion
  // ========================================================

  motion: {
    fast: "150ms",

    normal: "250ms",

    slow: "350ms",

    // Shared entrance/hover easing curve already reused by
    // convention across headquarters/* (Hero, MissionCard,
    // ActivityFeed, DecisionFeed, AIInsight, StatCard,
    // ActivityItem, DecisionItem) — previously uncaptured.
    easing: [0.22, 1, 0.36, 1],
  },

  // ========================================================
  // Spacing
  // ========================================================

  spacing: {
    xs: "4px",

    sm: "8px",

    md: "16px",

    lg: "24px",

    xl: "32px",

    "2xl": "48px",

    "3xl": "64px",
  },

  // ========================================================
  // Layout
  // ========================================================

  layout: {
    sidebarWidth: "260px",

    topbarHeight: "72px",

    contentMaxWidth: "1600px",

    contentPadding: "32px",

    cardPadding: "24px",
  },
} as const;

export type Tokens = typeof tokens;
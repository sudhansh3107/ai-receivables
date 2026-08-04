/**
 * ==========================================================
 * VSB Labs Design Tokens
 * ----------------------------------------------------------
 * The single source of truth for the UI.
 *
 * Rules:
 * • Never hardcode colors in components.
 * • Always import from "@/lib/theme/tokens".
 * • Every Digital Employee has its own identity.
 * ==========================================================
 */

export const tokens = {
  // ========================================================
  // Foundation
  // Raw colors
  // ========================================================
  colors: {
    white: "#FFFFFF",

    slate50: "#F8FAFC",
    slate100: "#F1F5F9",
    slate200: "#E2E8F0",
    slate300: "#CBD5E1",
    slate400: "#94A3B8",
    slate600: "#475569",
    slate900: "#0F172A",

    blue: "#4FD1FF",
    blueDark: "#2563EB",

    green: "#22C55E",

    amber: "#F59E0B",

    red: "#EF4444",

    violet: "#8B5CF6",
  },

  // ========================================================
  // Semantic
  // What colors actually mean
  // ========================================================
  semantic: {
    background: "#F8FAFC",

    surface: "#FFFFFF",

    card: "#FFFFFF",

    hover: "#F1F5F9",

    border: "#E2E8F0",

    textPrimary: "#0F172A",

    textSecondary: "#475569",

    textMuted: "#94A3B8",

    success: "#22C55E",

    warning: "#F59E0B",

    danger: "#EF4444",

    info: "#4FD1FF",
  },

  // ========================================================
  // Brand
  // ========================================================
  brand: {
    company: "VSB Labs",

    primary: "#4FD1FF",

    logo: "#0F172A",
  },

  // ========================================================
  // Digital Employees
  // ========================================================
  employees: {
    orion: {
      name: "Orion",

      accent: "#4FD1FF",

      background: "#E6F8FF",
    },

    atlas: {
      name: "Atlas",

      accent: "#22C55E",

      background: "#DCFCE7",
    },

    lyra: {
      name: "Lyra",

      accent: "#8B5CF6",

      background: "#F3E8FF",
    },

    nova: {
      name: "Nova",

      accent: "#F59E0B",

      background: "#FEF3C7",
    },

    sentinel: {
      name: "Sentinel",

      accent: "#EF4444",

      background: "#FEE2E2",
    },
  },

  // ========================================================
  // Trust Architecture
  // ========================================================
  trust: {
    level0: "#CBD5E1",

    level1: "#93C5FD",

    level2: "#4FD1FF",

    level3: "#22C55E",

    level4: "#8B5CF6",

    level5: "#F59E0B",
  },

  // ========================================================
  // Charts
  // ========================================================
  charts: {
    collections: "#4FD1FF",

    outstanding: "#F59E0B",

    overdue: "#EF4444",

    received: "#22C55E",

    forecast: "#8B5CF6",
  },

  // ========================================================
  // Gradients
  // ========================================================
  gradients: {
    orion: "linear-gradient(135deg,#4FD1FF,#2563EB)",

    atlas: "linear-gradient(135deg,#22C55E,#16A34A)",

    lyra: "linear-gradient(135deg,#8B5CF6,#7C3AED)",

    nova: "linear-gradient(135deg,#F59E0B,#D97706)",
  },

  // ========================================================
  // Border Radius
  // ========================================================
  radius: {
    sm: "8px",

    md: "12px",

    lg: "20px",

    xl: "28px",

    full: "9999px",
  },

  // ========================================================
  // Shadows
  // ========================================================
  shadows: {
    sm: "0 2px 8px rgba(15,23,42,.05)",

    md: "0 8px 24px rgba(15,23,42,.08)",

    lg: "0 16px 48px rgba(15,23,42,.12)",
  },

  motion: {
  fast: "150ms",

  normal: "250ms",

  slow: "350ms",
},

spacing: {
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "32px",
  "2xl": "48px",
},

} as const;

export type Tokens = typeof tokens;
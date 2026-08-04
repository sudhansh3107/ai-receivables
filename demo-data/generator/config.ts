/**
 * ==========================================================
 * Demo Company Configuration
 * ----------------------------------------------------------
 * Single source of truth for the company simulator.
 *
 * Every generator MUST use these values.
 * ==========================================================
 */

export const DEMO_CONFIG = {
  // ========================================================
  // Company
  // ========================================================

  COMPANY_NAME: "InsightBlend Analytics LLP",

  COMPANY_CODE: "IBA",

  CURRENCY: "INR",

  GST_PERCENTAGE: 18,

  // ========================================================
  // Demo Timeline
  // ========================================================

  START_DATE: new Date("2026-05-01"),

  END_DATE: new Date("2026-08-04"),

  // ========================================================
  // Dataset Size
  // ========================================================

  TOTAL_CLIENTS: 25,

  TOTAL_INVOICES: 150,

  // ========================================================
  // Invoice Distribution
  // ========================================================

  MAY_INVOICES: 40,

  JUNE_INVOICES: 50,

  JULY_INVOICES: 40,

  AUGUST_INVOICES: 20,

  // ========================================================
  // Current Invoice Status
  // ========================================================

  PAID_INVOICES: 125,

  PARTIAL_INVOICES: 10,

  OUTSTANDING_INVOICES: 15,

  // ========================================================
  // Payment Terms
  // ========================================================

  PAYMENT_TERMS: {
    PREMIUM: 15,

    STANDARD: 30,

    ENTERPRISE: 45,

    GOVERNMENT: 60,
  },

  // ========================================================
  // Invoice Value Ranges (INR)
  // ========================================================

  INVOICE_RANGES: {
    COLLEGE: {
      min: 80_000,
      max: 200_000,
    },

    UNIVERSITY: {
      min: 200_000,
      max: 400_000,
    },

    CORPORATE: {
      min: 150_000,
      max: 500_000,
    },

    TRAINING_PARTNER: {
      min: 100_000,
      max: 250_000,
    },

    GOVERNMENT: {
      min: 300_000,
      max: 600_000,
    },

    STARTUP: {
      min: 40_000,
      max: 100_000,
    },
  },
} as const;
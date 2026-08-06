/**
 * ==========================================================
 * Demo Company Configuration
 * ----------------------------------------------------------
 * Single source of truth for the company simulator.
 *
 * Every generator MUST use these values.
 * ==========================================================
 */

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const MONTHS_OF_HISTORY = 4;

const END_DATE = new Date();

const START_DATE = new Date(END_DATE);

// Start from the first day of the oldest month
START_DATE.setDate(1);

// Include the current month in the rolling window
START_DATE.setMonth(
  START_DATE.getMonth() - (MONTHS_OF_HISTORY - 1)
);

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

  START_DATE,

  END_DATE,

  MONTHS_OF_HISTORY,

  // ========================================================
  // Dataset Size
  // ========================================================

  TOTAL_CLIENTS: 25,

  TOTAL_INVOICES: 150,

  // ========================================================
  // Invoice Distribution
  // Distribution across the rolling timeline.
  // Index 0 = Oldest Month
  // Index 3 = Current Month
  // ========================================================

  MONTHLY_DISTRIBUTION: [
    40,
    50,
    40,
    20,
  ],

  // ========================================================
  // Current Invoice Status (Target Distribution)
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
"use client";

import { motion } from "motion/react";
import Card from "../ui/Card";
import { tokens } from "@/lib/theme/tokens";

export default function MorningBriefing() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <div className="space-y-6">

          {/* Greeting */}
          <div>
            <h1
              className="text-4xl font-bold"
              style={{
                color: tokens.semantic.textPrimary,
              }}
            >
              Good Evening, Sudhansh 👋
            </h1>

            <p
              className="mt-2 text-lg"
              style={{
                color: tokens.semantic.textSecondary,
              }}
            >
              Your Digital Workforce has been active
              for the last 6 hours.
            </p>
          </div>

          <hr
            style={{
              borderColor: tokens.semantic.border,
            }}
          />

          {/* Briefing */}
          <div>

            <p
              className="mb-4 text-sm font-semibold uppercase tracking-wider"
              style={{
                color: tokens.semantic.textMuted,
              }}
            >
              Today's Briefing
            </p>

            <div className="space-y-3">

              <p
                style={{
                  color: tokens.semantic.textPrimary,
                }}
              >
                ✓ Orion followed up <strong>17 invoices</strong>.
              </p>

              <p
                style={{
                  color: tokens.semantic.textPrimary,
                }}
              >
                ✓ ₹84,500 is expected this week.
              </p>

              <p
                style={{
                  color: tokens.semantic.textPrimary,
                }}
              >
                ✓ 3 customers require immediate attention.
              </p>

              <p
                style={{
                  color: tokens.semantic.textPrimary,
                }}
              >
                ✓ AI confidence score is <strong>94%</strong>.
              </p>

            </div>

          </div>

        </div>
      </Card>
    </motion.div>
  );
}
"use client";

import { motion } from "motion/react";
import Card from "../ui/Card";
import { tokens } from "@/lib/theme/tokens";

export default function DigitalEmployee() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <Card>
        <div className="space-y-8">

          {/* Header */}

          <div>

            <p
              className="text-xs font-semibold uppercase tracking-[0.25em]"
              style={{
                color: tokens.semantic.textMuted,
              }}
            >
              Digital Employee
            </p>

            <h2
              className="mt-2 text-2xl font-bold"
              style={{
                color: tokens.semantic.textPrimary,
              }}
            >
              Accounts Receivable
            </h2>

          </div>

          <hr
            style={{
              borderColor: tokens.semantic.border,
            }}
          />

          {/* Current Responsibilities */}

          <section>

            <p
              className="mb-5 text-xs font-semibold uppercase tracking-[0.2em]"
              style={{
                color: tokens.semantic.textMuted,
              }}
            >
              Current Responsibilities
            </p>

            <div className="space-y-3">

              <p>• Following up on overdue receivables</p>

              <p>• Monitoring collection commitments</p>

              <p>• Protecting customer relationships</p>

            </div>

          </section>

          <hr
            style={{
              borderColor: tokens.semantic.border,
            }}
          />

          {/* Today's Progress */}

          <section>

            <p
              className="mb-5 text-xs font-semibold uppercase tracking-[0.2em]"
              style={{
                color: tokens.semantic.textMuted,
              }}
            >
              Today's Progress
            </p>

            <div className="grid grid-cols-2 gap-y-4">

              <div className="flex justify-between">
                <span>Invoices Processed</span>
                <strong>42</strong>
              </div>

              <div className="flex justify-between">
                <span>Reminders Delivered</span>
                <strong>17</strong>
              </div>

              <div className="flex justify-between">
                <span>Payments Recorded</span>
                <strong>9</strong>
              </div>

              <div className="flex justify-between">
                <span>Promises To Pay</span>
                <strong>3</strong>
              </div>

            </div>

          </section>

          <hr
            style={{
              borderColor: tokens.semantic.border,
            }}
          />

          {/* Human Decisions */}

          <section>

            <p
              className="mb-5 text-xs font-semibold uppercase tracking-[0.2em]"
              style={{
                color: tokens.semantic.textMuted,
              }}
            >
              Human Decisions
            </p>

            <div className="space-y-4">

              <div>

                <h4 className="font-semibold">
                  Payment Extension
                </h4>

                <p
                  style={{
                    color: tokens.semantic.textSecondary,
                  }}
                >
                  ABC Technologies
                </p>

              </div>

              <div>

                <h4 className="font-semibold">
                  Credit Limit Exception
                </h4>

                <p
                  style={{
                    color: tokens.semantic.textSecondary,
                  }}
                >
                  XYZ University
                </p>

              </div>

            </div>

          </section>

          <hr
            style={{
              borderColor: tokens.semantic.border,
            }}
          />

          {/* Recommendation */}

          <section>

            <p
              className="mb-5 text-xs font-semibold uppercase tracking-[0.2em]"
              style={{
                color: tokens.semantic.textMuted,
              }}
            >
              Recommendation
            </p>

            <div
              className="rounded-xl border p-5"
              style={{
                borderColor: tokens.semantic.border,
              }}
            >

              <h3 className="font-semibold text-lg">
                Escalate Invoice IBA-2026-0098
              </h3>

              <p
                className="mt-4"
                style={{
                  color: tokens.semantic.textSecondary,
                }}
              >
                Expected Recovery
              </p>

              <p className="text-2xl font-bold mt-1">
                ₹4,20,000
              </p>

              <p
                className="mt-5"
                style={{
                  color: tokens.semantic.textSecondary,
                }}
              >
                Customer ignored four reminders over the last
                32 days.
              </p>

              <div className="mt-5 flex justify-between">

                <span
                  style={{
                    color: tokens.semantic.textSecondary,
                  }}
                >
                  Confidence
                </span>

                <strong>97%</strong>

              </div>

            </div>

          </section>

        </div>
      </Card>
    </motion.div>
  );
}
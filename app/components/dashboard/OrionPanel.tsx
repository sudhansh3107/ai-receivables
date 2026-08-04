"use client";

import { motion } from "motion/react";
import { ArrowRight, Bot, Clock3 } from "lucide-react";

import Card from "../ui/Card";
import Button from "../ui/Button";
import { tokens } from "@/lib/theme/tokens";

export default function OrionPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card interactive>
        <div className="space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{
                  backgroundColor: tokens.employees.orion.background,
                }}
              >
                <Bot
                  size={28}
                  color={tokens.employees.orion.accent}
                />
              </div>

              <div>
                <h2
                  className="text-2xl font-bold"
                  style={{
                    color: tokens.semantic.textPrimary,
                  }}
                >
                  Orion
                </h2>

                <p
                  className="text-sm"
                  style={{
                    color: tokens.semantic.textSecondary,
                  }}
                >
                  Accounts Receivable Specialist
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: tokens.semantic.success,
                }}
              />

              <span
                className="text-sm font-medium"
                style={{
                  color: tokens.semantic.success,
                }}
              >
                Working
              </span>
            </div>
          </div>

          <hr
            style={{
              borderColor: tokens.semantic.border,
            }}
          />

          {/* Current Task */}
          <div>
            <p
              className="mb-2 text-xs font-semibold uppercase tracking-widest"
              style={{
                color: tokens.semantic.textMuted,
              }}
            >
              Current Task
            </p>

            <h3
              className="text-xl font-semibold"
              style={{
                color: tokens.semantic.textPrimary,
              }}
            >
              Following up with ABC Industries
            </h3>

            <p
              className="mt-2"
              style={{
                color: tokens.semantic.textSecondary,
              }}
            >
              Invoice INV-2026-0148 · ₹84,500 Outstanding
            </p>
          </div>

          {/* Status Grid */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-widest"
                style={{
                  color: tokens.semantic.textMuted,
                }}
              >
                Last Activity
              </p>

              <div className="mt-3 flex items-center gap-2">
                <Clock3
                  size={16}
                  color={tokens.semantic.textSecondary}
                />

                <span
                  style={{
                    color: tokens.semantic.textPrimary,
                  }}
                >
                  2 minutes ago
                </span>
              </div>
            </div>

            <div>
              <p
                className="text-xs font-semibold uppercase tracking-widest"
                style={{
                  color: tokens.semantic.textMuted,
                }}
              >
                Confidence
              </p>

              <p
                className="mt-3 text-2xl font-bold"
                style={{
                  color: tokens.semantic.success,
                }}
              >
                94%
              </p>
            </div>
          </div>

          <hr
            style={{
              borderColor: tokens.semantic.border,
            }}
          />

          {/* Today's Output */}
          <div>
            <p
              className="mb-4 text-xs font-semibold uppercase tracking-widest"
              style={{
                color: tokens.semantic.textMuted,
              }}
            >
              Today's Output
            </p>

            <div className="grid grid-cols-3 gap-6">
              <div>
                <h3
                  className="text-3xl font-bold"
                  style={{
                    color: tokens.semantic.textPrimary,
                  }}
                >
                  17
                </h3>

                <p
                  className="mt-1 text-sm"
                  style={{
                    color: tokens.semantic.textSecondary,
                  }}
                >
                  Follow-ups
                </p>
              </div>

              <div>
                <h3
                  className="text-3xl font-bold"
                  style={{
                    color: tokens.semantic.textPrimary,
                  }}
                >
                  ₹84.5K
                </h3>

                <p
                  className="mt-1 text-sm"
                  style={{
                    color: tokens.semantic.textSecondary,
                  }}
                >
                  Expected
                </p>
              </div>

              <div>
                <h3
                  className="text-3xl font-bold"
                  style={{
                    color: tokens.semantic.textPrimary,
                  }}
                >
                  3
                </h3>

                <p
                  className="mt-1 text-sm"
                  style={{
                    color: tokens.semantic.textSecondary,
                  }}
                >
                  Escalations
                </p>
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="pt-2">
            <Button variant="secondary">
              <span>View Activity</span>
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
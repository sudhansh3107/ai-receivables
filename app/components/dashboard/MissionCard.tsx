"use client";

import { motion } from "motion/react";

import Card from "../ui/Card";
import { tokens } from "@/lib/theme/tokens";

export default function MissionCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card interactive>
        <div className="space-y-8">
          {/* Header */}
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{
                color: tokens.semantic.textMuted,
              }}
            >
              Today's Mission
            </p>

            <h2
              className="mt-4 text-5xl font-bold"
              style={{
                color: tokens.semantic.textPrimary,
              }}
            >
              ₹4.82L
            </h2>

            <p
              className="mt-2"
              style={{
                color: tokens.semantic.textSecondary,
              }}
            >
              Outstanding receivables to recover
            </p>
          </div>

          <hr
            style={{
              borderColor: tokens.semantic.border,
            }}
          />

          {/* Metrics */}
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <span
                style={{
                  color: tokens.semantic.textSecondary,
                }}
              >
                Invoices
              </span>

              <span
                className="font-semibold"
                style={{
                  color: tokens.semantic.textPrimary,
                }}
              >
                17
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span
                style={{
                  color: tokens.semantic.textSecondary,
                }}
              >
                Customers
              </span>

              <span
                className="font-semibold"
                style={{
                  color: tokens.semantic.textPrimary,
                }}
              >
                8
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span
                style={{
                  color: tokens.semantic.textSecondary,
                }}
              >
                Due Within
              </span>

              <span
                className="font-semibold"
                style={{
                  color: tokens.semantic.textPrimary,
                }}
              >
                7 Days
              </span>
            </div>
          </div>

          <hr
            style={{
              borderColor: tokens.semantic.border,
            }}
          />

          {/* Goal */}
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{
                color: tokens.semantic.textMuted,
              }}
            >
              Primary Goal
            </p>

            <p
              className="mt-3 text-lg font-medium"
              style={{
                color: tokens.semantic.textPrimary,
              }}
            >
              Reduce outstanding receivables by prioritizing high-value customers.
            </p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
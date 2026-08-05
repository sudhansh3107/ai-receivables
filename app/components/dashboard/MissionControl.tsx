"use client";

import { motion } from "motion/react";
import Card from "../ui/Card";
import Button from "../ui/Button";
import { tokens } from "@/lib/theme/tokens";
import type { DashboardStats } from "@/app/components/dashboard/stats";

interface MissionControlProps {
  stats: DashboardStats;
}

export default function MissionControl({
  stats,
}: MissionControlProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>

        <div className="space-y-10">

          {/* Header */}

          <div className="grid grid-cols-12 gap-10 items-start">

            {/* Left */}

            <div className="col-span-8">

              <p
                className="text-xs font-semibold uppercase tracking-[0.35em]"
                style={{
                  color: tokens.semantic.textMuted,
                }}
              >
                Mission Control
              </p>

              <h1
                className="mt-3 text-5xl font-bold leading-tight"
                style={{
                  color: tokens.semantic.textPrimary,
                }}
              >
                Good Afternoon 👋
              </h1>

              <p
                className="mt-6 max-w-2xl text-lg leading-8"
                style={{
                  color: tokens.semantic.textSecondary,
                }}
              >
                Orion is actively managing{" "}
                <strong>{stats.briefing.totalInvoices}</strong>{" "}
                invoices with an outstanding balance of{" "}
                <strong>
                  {stats.briefing.outstandingBalance.toLocaleString("en-IN", {
                    style: "currency",
                    currency: "INR",
                    maximumFractionDigits: 0,
                  })}
                </strong>
                .{" "}
                <span
                  style={{
                    color:
                      stats.briefing.overdueInvoices > 0
                        ? tokens.semantic.warning
                        : tokens.semantic.success,
                    fontWeight: 700,
                  }}
                >
                  {stats.briefing.overdueInvoices} overdue invoices
                </span>{" "}
                currently require attention.
              </p>

            </div>

            {/* Right */}

            <div className="col-span-4 flex flex-col items-end gap-4">

              <div
                className="flex items-center gap-3 rounded-full border px-5 py-3"
                style={{
                  borderColor: tokens.semantic.border,
                  background: tokens.semantic.surface,
                }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full animate-pulse"
                  style={{
                    background: tokens.semantic.success,
                  }}
                />

                <span
                  className="font-semibold"
                  style={{
                    color: tokens.semantic.textPrimary,
                  }}
                >
                  Orion Online
                </span>
              </div>

              <Button>
                Upload Invoice
              </Button>

            </div>

          </div>

          {/* KPI Cards */}

          <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">

            <Metric
              title="Outstanding Balance"
              value={stats.kpis.outstandingBalance.toLocaleString("en-IN", {
                style: "currency",
                currency: "INR",
                maximumFractionDigits: 0,
              })}
              highlight={false}
            />

            <Metric
              title="Invoices"
              value={stats.kpis.totalInvoices.toString()}
              highlight={false}
            />

            <Metric
              title="Overdue"
              value={stats.kpis.overdueInvoices.toString()}
              highlight={stats.kpis.overdueInvoices > 0}
            />

            <Metric
              title="AI Confidence"
              value={`${stats.kpis.averageConfidence}%`}
              highlight={false}
            />

          </div>

        </div>

      </Card>
    </motion.div>
  );
}

interface MetricProps {
  title: string;
  value: string;
  highlight?: boolean;
}

function Metric({
  title,
  value,
  highlight = false,
}: MetricProps) {
  return (
    <div
      className="rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-1"
      style={{
        borderColor: tokens.semantic.border,
        background: tokens.semantic.surface,
      }}
    >
      <p
        className="uppercase tracking-wider"
        style={{
          color: tokens.semantic.textMuted,
          fontSize: "12px",
          fontWeight: 600,
        }}
      >
        {title}
      </p>

      <h2
        className="mt-4 text-5xl font-bold"
        style={{
          color: highlight
            ? tokens.semantic.warning
            : tokens.semantic.textPrimary,
        }}
      >
        {value}
      </h2>
    </div>
  );
}
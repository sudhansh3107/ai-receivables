"use client";

import { motion } from "motion/react";
import { Compass } from "lucide-react";

import Card from "../ui/Card";
import { tokens } from "@/lib/theme/tokens";
import { useDashboard } from "@/app/hooks/useDashboard";

export default function MissionCard() {
  const {
    dashboard,
    loading,
    error,
  } = useDashboard();

  if (loading || error || !dashboard) {
    return null;
  }

  const { mission } = dashboard;

  if (!mission) {
    return null;
  }

  const {
    activeWork,
    decisions,
    completedToday,
    completionPercentage,
  } = mission;

  // Only when ALL THREE are zero does the card say "clear" — decisions
  // alone being non-zero must never trigger this (decisions are a
  // separate, human-owned queue, not part of the employee's own
  // workload completion — see completionPercentage, which already
  // excludes decisions from its formula and therefore always reads
  // 100 in that case too).
  const isFullyClear =
    activeWork === 0 && decisions === 0 && completedToday === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.55,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <Card
        className="flex min-h-[380px] flex-col overflow-hidden dashboard-card rounded-[30px] p-0"
        style={{
          background: "#E8DAC7",
          border: "1px solid #DCCAB4",
        }}
      >
        <div className="flex flex-1 flex-col justify-center px-2 py-1">

          <div
            className="flex h-11 w-11 items-center justify-center rounded-full"
            style={{
              background: tokens.semantic.surfaceWarm,
            }}
          >

            <Compass
              size={20}
              strokeWidth={1.8}
              color="#8D745A"
            />

          </div>

          <p className="mt-11 text-[13px] font-semibold uppercase tracking-[0.18em] text-[#8D745A]">
            Current Mission
          </p>

          <h2 className="mt-5 text-[20px] font-semibold leading-[30px] tracking-[-0.02em] text-[#1F1B18]">
            Collecting Receivables
          </h2>

          {/* Progress */}

          <div className="mt-5 flex items-center justify-between">

            <p className="text-[13px] font-medium text-[#8D745A]">
              {isFullyClear
                ? "Mission workload is clear"
                : "Today's employee workload"}
            </p>

            <p className="text-[17px] font-semibold leading-none text-[#1F1B18]">
              {completionPercentage}%
            </p>

          </div>

          <div
            className="mt-5 h-[6px] overflow-hidden rounded-full"
            style={{
              background: "#D4C1AC",
            }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${completionPercentage}%`,
                background: tokens.brand.primary,
                transition: `width ${tokens.motion.slow} ease`,
              }}
            />
          </div>

          {/* Workload metrics — always shown, compact. DECISIONS is
              visually distinguished (its own background/color) since
              it represents human authority, not employee-owned work. */}

          <div className="mt-9 space-y-3">

            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#6B6158]">
                Work
              </span>
              <span className="text-[14px] font-semibold text-[#1F1B18]">
                {activeWork}
              </span>
            </div>

            <div
              className="-mx-2 flex items-center justify-between rounded-lg px-2 py-1"
              style={{
                background: tokens.status.info.background,
              }}
            >
              <span
                className="text-[13px] font-semibold"
                style={{ color: tokens.status.info.text }}
              >
                Decisions
              </span>
              <span
                className="text-[14px] font-semibold"
                style={{ color: tokens.status.info.text }}
              >
                {decisions}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#6B6158]">
                Completed today
              </span>
              <span className="text-[14px] font-semibold text-[#1F1B18]">
                {completedToday}
              </span>
            </div>

          </div>

        </div>

      </Card>

    </motion.div>
  );
}

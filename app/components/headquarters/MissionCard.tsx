"use client";

import { motion } from "motion/react";
import {
  Clock3,
  Compass,
  FileWarning,
  LucideIcon,
} from "lucide-react";

import Card from "../ui/Card";
import { tokens } from "@/lib/theme/tokens";
import { useDashboard } from "@/app/hooks/useDashboard";

interface RemainingItem {
  key: string;
  count: number;
  label: string;
  icon: LucideIcon;
  color: string;
}

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

  const { completedToday, remainingToday } = mission;
  const totalToday = completedToday + remainingToday;
  const progress =
    totalToday > 0 ? completedToday / totalToday : null;

  const remainingBreakdown: RemainingItem[] = [
    {
      key: "follow-ups",
      count: mission.remainingFollowUps,
      label:
        mission.remainingFollowUps === 1
          ? "1 payment follow-up"
          : `${mission.remainingFollowUps} payment follow-ups`,
      icon: Clock3,
      color: tokens.status.info.text,
    },
    {
      key: "reviews",
      count: mission.remainingReviews,
      label:
        mission.remainingReviews === 1
          ? "1 invoice review"
          : `${mission.remainingReviews} invoice reviews`,
      icon: FileWarning,
      color: tokens.status.pending.text,
    },
  ].filter((item) => item.count > 0);

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
        className="flex min-h-[360px] flex-col overflow-hidden dashboard-card rounded-[30px] p-0"
        style={{
          background: "#E8DAC7",
          border: "1px solid #DCCAB4",
        }}
      >
        <div className="flex flex-1 flex-col justify-center px-8 py-8">

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

          <p className="mt-6 text-[13px] font-semibold uppercase tracking-[0.18em] text-[#8D745A]">
            Current Mission
          </p>

          {totalToday > 0 ? (
            <>
              <h2 className="mt-3 text-[22px] font-semibold leading-[30px] tracking-[-0.02em] text-[#1F1B18]">
                Clear today&apos;s receivables workload
              </h2>

              <div className="mt-4 flex items-center justify-between">

                <p className="text-[15px] font-medium text-[#3B332B]">
                  {completedToday} of {totalToday} completed
                </p>

                <p className="text-[13px] font-semibold text-[#8D745A]">
                  {Math.round((progress ?? 0) * 100)}%
                </p>

              </div>

              <div
                className="mt-2 h-[6px] overflow-hidden rounded-full"
                style={{
                  background: "#D4C1AC",
                }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(progress ?? 0) * 100}%`,
                    background: tokens.brand.primary,
                    transition: `width ${tokens.motion.slow} ease`,
                  }}
                />
              </div>

              <p className="mt-3 text-[13px] text-[#6B6158]">
                {remainingToday === 1
                  ? "1 action remaining"
                  : `${remainingToday} actions remaining`}
              </p>

              {remainingBreakdown.length > 0 && (
                <div className="mt-4 space-y-3">

                  {remainingBreakdown.map((item) => {
                    const Icon = item.icon;

                    return (
                      <div
                        key={item.key}
                        className="flex items-center gap-3"
                      >
                        <Icon
                          size={15}
                          strokeWidth={2}
                          color={item.color}
                        />

                        <span className="text-[14px] text-[#3B332B]">
                          {item.label}
                        </span>
                      </div>
                    );
                  })}

                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="mt-3 text-[22px] font-semibold leading-[30px] tracking-[-0.02em] text-[#1F1B18]">
                Today&apos;s receivables workload is clear.
              </h2>

              <p className="mt-3 text-[14px] leading-7 text-[#5C5148]">
                No urgent actions require attention.
              </p>
            </>
          )}

        </div>

      </Card>

    </motion.div>
  );
}

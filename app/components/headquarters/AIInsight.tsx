"use client";

import { motion } from "motion/react";
import {
  ArrowRight,
  Sparkles,
} from "lucide-react";

import Card from "../ui/Card";
import { useDashboard } from "@/app/hooks/useDashboard";

function formatUpdatedAt(dateString: string) {
  const updated = new Date(dateString);
  const diffMinutes = Math.round(
    (Date.now() - updated.getTime()) / 60000
  );

  if (diffMinutes < 1) return "Updated just now";
  if (diffMinutes < 60) return `Updated ${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Updated ${diffHours}h ago`;

  return `Updated ${updated.toLocaleDateString()}`;
}

export default function AIInsight() {
  const {
    dashboard,
    loading,
    error,
  } = useDashboard();

  if (loading || error || !dashboard) {
    return null;
  }

  const { insight } = dashboard;

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
        className="rounded-[30px] p-0"
        style={{
          background: "#FFFFFF",
          border: "1px solid #E6DED4",
        }}
      >
        <div className="grid grid-cols-12">

          {/* Left */}

          <div className="col-span-7 px-4 py-4">

            <div className="flex items-center gap-3">

              <Sparkles
                size={24}
                strokeWidth={1.7}
                color="#B88A4B"
              />

              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[#1A1A1A]">
                AI Insight
              </h2>

            </div>

            <div className="mt-7">

              <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#A48B6B]">
                Employee Noticed
              </p>

              {insight ? (
                <p className="mt-3 text-[15px] leading-8 text-[#2B2B2B]">
                  {insight.noticed}
                </p>
              ) : (
                <p className="mt-3 text-[15px] leading-8 text-[#8C857C]">
                  No insight yet. I&apos;ll have something to share
                  once I&apos;ve processed enough invoices for a
                  customer.
                </p>
              )}

            </div>

          </div>

          {/* Right */}

          <div className="col-span-5 flex flex-col border-l border-[#EFE8E0] px-4 py-4">

            <div className="flex items-center gap-2">

              <span className="employee-status-wrapper scale-[0.55]">
                <span className="employee-status" />
              </span>

              <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#A48B6B]">
                Next Action
              </p>

            </div>

            <div className="pl-[22px]">

              <p className="mt-4 text-[15px] leading-8 text-[#2B2B2B]">
                {insight?.nextAction ?? "No action scheduled right now."}
              </p>

              <div className="my-5 h-px bg-[#EFE8E0]" />

              <div>

                <p className="text-[12px] font-medium text-[#8C857C]">
                  {insight
                    ? formatUpdatedAt(insight.updatedAt)
                    : "Not analysed yet"}
                </p>

                <p className="mt-1 text-[11px] text-[#A7A199]">
                  {insight
                    ? insight.customerName
                    : "Awaiting invoice activity"}
                </p>

              </div>

            </div>

            <button
              className="
                mt-4
                flex
                items-center
                gap-2
                text-[15px]
                font-semibold
                text-[#2B211A]
                transition-all
                duration-300
                hover:gap-3
                hover:text-[#B88A4B]
              "
            >
              View full insights

              <ArrowRight
                size={17}
                strokeWidth={2}
              />

            </button>

          </div>

        </div>

      </Card>

    </motion.div>
  );
}

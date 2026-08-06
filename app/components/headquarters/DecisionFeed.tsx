"use client";

import { motion } from "motion/react";
import {
  ArrowRight,
  CalendarDays,
  Handshake,
} from "lucide-react";

import Card from "../ui/Card";
import DecisionItem from "./DecisionItem";

export default function DecisionFeed() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="h-full"
    >
      <Card
        className="flex h-[410px] flex-col rounded-[30px] p-0"
        style={{
          background: "#FFFFFF",
          border: "1px solid #E6DED4",
        }}
      >
        {/* Header */}

        <div className="flex items-center justify-between px-3 py-2">

          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">
            Needs Your Decision
          </h2>

          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FBE8E6]">

            <span className="text-[13px] font-semibold text-[#C96D55]">
              2
            </span>

          </div>

        </div>

        {/* Feed */}

        <div className="mt-3 space-y-4 px-3">

          <DecisionItem
            icon={Handshake}
            iconColor="#C96D55"
            iconBackground="#FBE8E6"
            title="Approve settlement with"
            company="ABC Industries"
            subtitle="Invoice #INV-2391 · ₹82,000"
          />

          <DecisionItem
            icon={CalendarDays}
            iconColor="#C9A66B"
            iconBackground="#F7EAD6"
            title="Approve extension request"
            company="Global Solutions"
            subtitle="Invoice #INV-2387 · 15 days"
          />

        </div>

        {/* Footer */}

        <button
          className="
            mt-4
            flex
            items-center
            gap-2
            px-7
            py-4
            text-[15px]
            font-semibold
            text-[#2B211A]
            transition
            hover:text-[#8F6B4A]
          "
        >
          View all approvals

          <ArrowRight
            size={17}
            strokeWidth={2}
          />

        </button>

      </Card>
    </motion.div>
  );
}
"use client";

import { motion } from "motion/react";
import {
  ArrowRight,
  IndianRupee,
  Mail,
  Phone,
} from "lucide-react";

import Card from "../ui/Card";
import ActivityItem from "./ActivityItem";

export default function ActivityFeed() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="h-full"
    >
      <Card
        className="flex h-[400px] flex-col rounded-[30px] p-0"
        style={{
          background: "#FFFFFF",
          border: "1px solid #E6DED4",
        }}
      >
        {/* Header */}

        <div className="flex items-center justify-between border-b border-[#EFE8E0] px-2 py-2">

          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">
            Employee Activity
          </h2>

          <div className="flex items-center gap-2">

            <div className="h-3 w-3 rounded-full bg-[#6E8F63]" />

            <span className="text-[15px] font-medium text-[#6B645C]">
              Live
            </span>

          </div>

        </div>

        {/* Feed */}

        <div className="px-2 py-2">

          <ActivityItem
            time="10:42 AM"
            icon={Phone}
            iconColor="#8F6B4A"
            title="Spoke with ABC Industries"
            subtitle="Discussed overdue Invoice #INV-2391"
          />

          <ActivityItem
            time="10:17 AM"
            icon={Mail}
            iconColor="#8F6B4A"
            title="Reminder sent to Global Solutions"
            subtitle="Invoice #INV-2377 · Stage 2"
          />

          <ActivityItem
            time="09:58 AM"
            icon={IndianRupee}
            iconColor="#8F6B4A"
            title="Payment received from TechNova"
            subtitle="Invoice #INV-2378 · ₹1,24,000"
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
            py-2
            text-[15px]
            font-semibold
            text-[#2B211A]
            transition
            hover:text-[#8F6B4A]
          "
        >
          View full activity

          <ArrowRight
            size={17}
            strokeWidth={2}
          />
        </button>

      </Card>
    </motion.div>
  );
}
"use client";

import { motion } from "motion/react";
import {
  ArrowRight,
  CalendarDays,
  FileText,
  Handshake,
  IndianRupee,
  Mail,
  Phone,
  TriangleAlert,
} from "lucide-react";

import Card from "../ui/Card";
import ActivityItem from "./ActivityItem";
import { useDashboard } from "@/app/hooks/useDashboard";

const iconMap = {
  payment: IndianRupee,
  mail: Mail,
  phone: Phone,
  calendar: CalendarDays,
  document: FileText,
  warning: TriangleAlert,
  handshake: Handshake,
} as const;

const iconColorMap = {
  payment: "#8F6B4A",
  mail: "#8F6B4A",
  phone: "#8F6B4A",
  calendar: "#B88A4B",
  document: "#6E8F63",
  warning: "#C96D55",
  handshake: "#8F6B4A",
} as const;

export default function ActivityFeed() {
  const {
    dashboard,
    loading,
    error,
  } = useDashboard();

  if (loading || error || !dashboard) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.55,
        ease: [0.22, 1, 0.36, 1],
      }}
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

        <div className="flex items-center justify-between border-b border-[#EFE8E0] px-2 py-2">

          <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">
            Employee Activity
          </h2>

          <div className="flex items-center gap-2">

            <div className="relative flex h-3 w-3 items-center justify-center">
              <span className="absolute h-3 w-3 rounded-full bg-[#6E8F63] opacity-30 animate-ping" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-[#6E8F63]" />
            </div>

            <span className="text-[15px] font-medium text-[#6B645C]">
              Live
            </span>

          </div>

        </div>

        {/* Feed */}

        <div className="px-2 py-2">

          {dashboard.activity.map((activity, index) => (
            <ActivityItem
              key={activity.id}
              time={activity.time}
              icon={iconMap[activity.icon]}
              iconColor={iconColorMap[activity.icon]}
              title={activity.title}
              subtitle={activity.subtitle}
              status={activity.status}
              showLine={index < dashboard.activity.length - 1}
            />
          ))}

        </div>

        {/* Footer */}

        <button
          className="
            -mt-2
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
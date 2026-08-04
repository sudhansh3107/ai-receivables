"use client";

import { motion } from "motion/react";
import {
  BellRing,
  FileText,
  Mail,
  UserRound,
} from "lucide-react";

import Card from "../ui/Card";
import Button from "../ui/Button";
import { tokens } from "@/lib/theme/tokens";

const activities = [
  {
    icon: Mail,
    title: "I followed up with ABC Industries.",
    subtitle:
      "They usually respond within 48 hours. I'll remind them again tomorrow if needed.",
    time: "2 min ago",
    color: tokens.semantic.success,
  },
  {
    icon: FileText,
    title: "I extracted Invoice INV-2026-0148.",
    subtitle:
      "The invoice was processed successfully with 98% confidence.",
    time: "11 min ago",
    color: tokens.employees.orion.accent,
  },
  {
    icon: BellRing,
    title: "I'm preparing Invoice INV-2026-0149 for review.",
    subtitle:
      "Business validation is in progress before approval.",
    time: "24 min ago",
    color: tokens.semantic.warning,
  },
  {
    icon: UserRound,
    title: "I updated Acme Corporation's customer profile.",
    subtitle:
      "Payment history and contact details have been synchronized.",
    time: "38 min ago",
    color: tokens.trust.level4,
  },
];

export default function ActivityTimeline() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <div className="space-y-8">

          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <p
                className="text-xs font-semibold uppercase tracking-widest"
                style={{
                  color: tokens.semantic.textMuted,
                }}
              >
                Orion's Work Log
              </p>

              <h2
                className="mt-2 text-2xl font-bold"
                style={{
                  color: tokens.semantic.textPrimary,
                }}
              >
                Here's what I've been working on
              </h2>

              <p
                className="mt-1 text-sm"
                style={{
                  color: tokens.semantic.textSecondary,
                }}
              >
                A live journal of my recent work across your business.
              </p>
            </div>

            <Button variant="ghost">
              View All Activity
            </Button>
          </div>

          {/* Timeline */}
          <div className="space-y-8">
            {activities.map((activity, index) => {
              const Icon = activity.icon;

              return (
                <div
                  key={`${activity.title}-${activity.time}`}
                  className="flex gap-4"
                >
                  {/* Timeline */}
                  <div className="flex flex-col items-center">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-xl"
                      style={{
                        backgroundColor: tokens.semantic.hover,
                      }}
                    >
                      <Icon
                        size={18}
                        color={activity.color}
                      />
                    </div>

                    {index !== activities.length - 1 && (
                      <div
                        className="mt-3 w-px flex-1"
                        style={{
                          backgroundColor: tokens.semantic.border,
                          minHeight: "56px",
                        }}
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex flex-1 justify-between gap-6">
                    <div className="flex-1">
                      <p
                        className="font-semibold leading-6"
                        style={{
                          color: tokens.semantic.textPrimary,
                        }}
                      >
                        {activity.title}
                      </p>

                      <p
                        className="mt-2 text-sm leading-6"
                        style={{
                          color: tokens.semantic.textSecondary,
                        }}
                      >
                        {activity.subtitle}
                      </p>
                    </div>

                    <div className="shrink-0">
                      <span
                        className="text-sm"
                        style={{
                          color: tokens.semantic.textMuted,
                        }}
                      >
                        {activity.time}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </Card>
    </motion.div>
  );
}
"use client";

import { motion } from "motion/react";
import {
  ArrowUpRight,
  BarChart3,
  FileUp,
  FileSearch,
  Users,
} from "lucide-react";

import Card from "../ui/Card";
import { tokens } from "@/lib/theme/tokens";

const actions = [
  {
    title: "Upload Invoice",
    subtitle: "Import a new invoice",
    icon: FileUp,
  },
  {
    title: "Review Queue",
    subtitle: "Invoices awaiting approval",
    icon: FileSearch,
  },
  {
    title: "Customers",
    subtitle: "Manage customer profiles",
    icon: Users,
  },
  {
    title: "Analytics",
    subtitle: "Collections & performance",
    icon: BarChart3,
  },
];

export default function QuickActions() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <div className="space-y-6">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{
                color: tokens.semantic.textMuted,
              }}
            >
              Quick Actions
            </p>

            <h2
              className="mt-2 text-2xl font-bold"
              style={{
                color: tokens.semantic.textPrimary,
              }}
            >
              What would you like to do?
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {actions.map((action) => {
              const Icon = action.icon;

              return (
                <motion.button
                  key={action.title}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center justify-between rounded-2xl border p-5 text-left transition-all"
                  style={{
                    borderColor: tokens.semantic.border,
                    backgroundColor: tokens.semantic.surface,
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-xl"
                      style={{
                        backgroundColor:
                          tokens.employees.orion.background,
                      }}
                    >
                      <Icon
                        size={22}
                        color={tokens.employees.orion.accent}
                      />
                    </div>

                    <div>
                      <p
                        className="font-semibold"
                        style={{
                          color: tokens.semantic.textPrimary,
                        }}
                      >
                        {action.title}
                      </p>

                      <p
                        className="text-sm"
                        style={{
                          color: tokens.semantic.textSecondary,
                        }}
                      >
                        {action.subtitle}
                      </p>
                    </div>
                  </div>

                  <ArrowUpRight
                    size={18}
                    color={tokens.semantic.textMuted}
                  />
                </motion.button>
              );
            })}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
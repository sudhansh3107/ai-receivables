"use client";

import { motion } from "motion/react";
import { LucideIcon } from "lucide-react";
import { tokens } from "@/lib/theme/tokens";

interface SidebarItemProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  status?: string;
  active?: boolean;
  onClick?: () => void;
}

export default function SidebarItem({
  icon: Icon,
  title,
  subtitle,
  status,
  active = false,
  onClick,
}: SidebarItemProps) {
  return (
    <motion.button
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className="w-full cursor-pointer rounded-2xl border p-4 text-left transition-all"
      style={{
        backgroundColor: active
          ? tokens.employees.orion.background
          : "transparent",

        borderColor: active
          ? tokens.employees.orion.accent
          : "transparent",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl"
          style={{
            backgroundColor: active
              ? tokens.employees.orion.accent
              : tokens.semantic.hover,
          }}
        >
          <Icon
            size={20}
            color={
              active
                ? tokens.colors.white
                : tokens.semantic.textSecondary
            }
          />
        </div>

        <div className="min-w-0 flex-1">
          <p
            className="font-semibold"
            style={{
              color: tokens.semantic.textPrimary,
            }}
          >
            {title}
          </p>

          {subtitle && (
            <p
              className="text-sm"
              style={{
                color: tokens.semantic.textMuted,
              }}
            >
              {subtitle}
            </p>
          )}

          {status && (
            <div className="mt-2 flex items-center gap-2">
              <div
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: tokens.semantic.success,
                }}
              />

              <span
                className="text-xs font-medium"
                style={{
                  color: tokens.semantic.textSecondary,
                }}
              >
                {status}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}
"use client";

import { motion } from "motion/react";
import { LucideIcon, ChevronRight } from "lucide-react";
import { tokens } from "@/lib/theme/tokens";
import Button from "../ui/Button";

interface DecisionItemProps {
  icon: LucideIcon;
  iconColor: string;
  iconBackground: string;

  title: string;
  company: string;
  subtitle: string;
  reasons?: string[] | null;

  actionLabel?: string;
  onAction?: () => void;
  actionPending?: boolean;
}

export default function DecisionItem({
  icon: Icon,
  iconColor,
  iconBackground,
  title,
  company,
  subtitle,
  reasons,
  actionLabel,
  onAction,
  actionPending = false,
}: DecisionItemProps) {
  return (
    <motion.div
      whileHover={{
        y: -2,
        boxShadow: tokens.shadows.hover,
      }}
      transition={{
        duration: 0.25,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="
        group
        flex
        w-full
        items-center
        justify-between
        rounded-2xl
        border
        border-[#ECE4DA]
        bg-[#FCFAF7]
        p-5
        transition-all
        duration-300
        hover:border-[#E1D4C5]
        hover:bg-[#F9F6F2]
      "
    >
      {/* Left */}

      <div className="flex items-center gap-4">

        {/* Icon */}

        <motion.div
          whileHover={{
            scale: 1.05,
          }}
          transition={{
            duration: 0.2,
          }}
          className="
            flex
            h-14
            w-14
            shrink-0
            items-center
            justify-center
            rounded-2xl
            shadow-[inset_0_1px_1px_rgba(255,255,255,0.45)]
          "
          style={{
            background: `linear-gradient(180deg, #FFFFFF 0%, ${iconBackground} 100%)`,
          }}
        >
          <Icon
            size={22}
            strokeWidth={2}
            color={iconColor}
          />
        </motion.div>

        {/* Text */}

        <div className="text-left">

          <h3 className="text-[13px] font-semibold leading-[18px] tracking-[-0.01em] text-[#1A1A1A]">
            {title}
          </h3>

          <p className="mt-1 text-[14px] font-semibold tracking-[-0.015em] text-[#1A1A1A]">
            {company}
          </p>

          <span className="mt-3 block text-[12px] leading-[16px] text-[#6B645C]">
            {subtitle}
          </span>

          {reasons !== undefined && (
            <p
              className="mt-1.5 text-[11px] leading-[15px]"
              style={{
                color: tokens.semantic.textMuted,
              }}
            >
              {reasons && reasons.length > 0
                ? `What I confirmed: ${reasons.join(", ")}`
                : "Review recommended based on low confidence."}
            </p>
          )}

        </div>

      </div>

      {/* Right: explicit action, or a plain chevron if none applies */}

      {actionLabel && onAction ? (
        <Button
          variant="secondary"
          onClick={onAction}
          disabled={actionPending}
          className="ml-4 shrink-0"
        >
          {actionPending ? "Saving…" : actionLabel}
        </Button>
      ) : (
        <motion.div
          whileHover={{
            x: 3,
          }}
          transition={{
            duration: 0.2,
          }}
        >
          <ChevronRight
            size={19}
            strokeWidth={2}
            className="
              text-[#7D7D7D]
              transition-colors
              duration-300
              group-hover:text-[#8F6B4A]
            "
          />
        </motion.div>
      )}

    </motion.div>
  );
}

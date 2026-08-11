"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { LucideIcon, ChevronRight } from "lucide-react";
import { tokens } from "@/lib/theme/tokens";
import Button from "../ui/Button";

export interface DecisionHoverAction {
  key: string;
  label: string;
  // Either a navigation target (rendered as a Link) or a click
  // handler (rendered as a Button) — a single action never needs both.
  href?: string;
  onClick?: () => void;
  pending?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

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

  // Hover-revealed action row — distinct from actionLabel/onAction
  // above (which stays permanently visible, unchanged, for
  // low_confidence/payment_follow_up). Used by payment_decision items,
  // which may offer more than one contextual action.
  hoverActions?: DecisionHoverAction[];
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
  hoverActions,
}: DecisionItemProps) {
  const hasAction = Boolean(actionLabel && onAction);
  const hasHoverActions = Boolean(hoverActions && hoverActions.length > 0);
  const hasBottomActions = hasAction || hasHoverActions;

  const icon = (
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
  );

  const text = (
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
  );

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
      className={`
        group
        w-full
        rounded-2xl
        border
        border-[#ECE4DA]
        bg-[#FCFAF7]
        p-5
        transition-all
        duration-300
        hover:border-[#E1D4C5]
        hover:bg-[#F9F6F2]
        ${
          hasBottomActions
            ? "flex flex-col"
            : "flex items-center justify-between"
        }
      `}
    >
      {hasBottomActions ? (
        <>
          {/* Icon + text — full row width, nothing competing for space */}

          <div className="flex items-start gap-4">
            {icon}
            {text}
          </div>

          {/* Action — its own row. Permanently visible for the
              existing single-action case (actionLabel/onAction,
              unchanged); hover-revealed for hoverActions. */}

          <div
            className={`
              mt-4
              flex
              justify-end
              gap-2
              ${
                hasHoverActions
                  ? "opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
                  : ""
              }
            `}
          >
            {hasAction && (
              <Button
                variant="secondary"
                onClick={onAction}
                disabled={actionPending}
              >
                {actionPending ? "Saving…" : actionLabel}
              </Button>
            )}

            {hoverActions?.map((action) =>
              action.href ? (
                <Link
                  key={action.key}
                  href={action.href}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border px-5 text-sm font-medium whitespace-nowrap transition-colors duration-200"
                  style={{
                    borderColor: tokens.semantic.border,
                    color: tokens.semantic.textPrimary,
                  }}
                >
                  {action.label}
                </Link>
              ) : (
                <Button
                  key={action.key}
                  variant={action.variant ?? "secondary"}
                  onClick={action.onClick}
                  disabled={action.pending}
                >
                  {action.pending ? "…" : action.label}
                </Button>
              )
            )}
          </div>
        </>
      ) : (
        <>
          {/* Left */}

          <div className="flex items-center gap-4">
            {icon}
            {text}
          </div>

          {/* Right: plain chevron, no action to take */}

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
        </>
      )}

    </motion.div>
  );
}

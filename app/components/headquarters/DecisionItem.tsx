"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { LucideIcon, ChevronRight } from "lucide-react";
import { tokens } from "@/lib/theme/tokens";
import Button from "../ui/Button";

// Restrained, semantic tone per action — reuses existing token pairs
// already present elsewhere in the app (tokens.status.*), not new
// colors. "approve" intentionally reuses the muted completed-green
// pairing (light background, muted text) rather than a saturated CTA
// green; "review" reuses the same info-blue already used for
// execution-status badges; "wait" is deliberately neutral (no
// tokens.status.* entry reads as urgent/positive/negative).
export type DecisionHoverActionTone = "approve" | "wait" | "review";

export interface DecisionHoverAction {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: DecisionHoverActionTone;
  // Either a navigation target (rendered as a Link) or a click
  // handler (rendered as a button) — a single action never needs both.
  href?: string;
  onClick?: () => void;
  pending?: boolean;
  // Visibly present but inert, e.g. Approve on a decision that still
  // needs review — communicates the option exists without letting it
  // bypass an existing safety boundary. Distinct from `pending`
  // (in-flight request) so the two states never get confused.
  disabled?: boolean;
  ariaLabel?: string;
}

const HOVER_ACTION_TONE_STYLES: Record<
  DecisionHoverActionTone,
  { background: string; color: string }
> = {
  approve: {
    background: tokens.status.completed.background,
    color: tokens.status.completed.text,
  },
  wait: {
    background: tokens.semantic.hover,
    color: tokens.semantic.textSecondary,
  },
  review: {
    background: tokens.status.info.background,
    color: tokens.status.info.text,
  },
};

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
        relative
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
        ${hasHoverActions ? "overflow-hidden" : ""}
        ${
          hasBottomActions
            ? "flex flex-col"
            : "flex items-center justify-between"
        }
      `}
    >
      {hasBottomActions ? (
        <>
          {/* Icon + text — same size/position whether or not this card
              has hover actions; the overlay below sits on top rather
              than adding a row, so nothing here grows the card. */}

          <div className="flex items-start gap-4">
            {icon}
            {text}
          </div>

          {/* Existing single-action case (actionLabel/onAction) — the
              only action kind this card can have at the same time as
              hasHoverActions is false, so this permanently-visible row
              is unaffected by the overlay below. */}

          {hasAction && (
            <div className="mt-4 flex justify-end">
              <Button
                variant="secondary"
                onClick={onAction}
                disabled={actionPending}
              >
                {actionPending ? "Saving…" : actionLabel}
              </Button>
            </div>
          )}

          {/* Hover overlay — contained INSIDE the card (absolute,
              inset-0), so it never changes the card's size. Translucent
              + blurred so the underlying content stays subtly visible.
              Revealed on hover AND keyboard focus (Tab into an action
              reveals it), never permanently visible. */}

          {hasHoverActions && (
            <div
              className="
                pointer-events-none
                absolute
                inset-0
                flex
                items-center
                justify-center
                gap-2
                rounded-2xl
                opacity-0
                backdrop-blur-[3px]
                transition-opacity
                duration-200
                ease-out
                group-hover:pointer-events-auto
                group-hover:opacity-100
                group-focus-within:pointer-events-auto
                group-focus-within:opacity-100
              "
              style={{
                background: "rgba(252,250,247,0.82)",
              }}
            >
              <div
                className="
                  flex
                  scale-95
                  items-center
                  gap-2
                  transition-transform
                  duration-200
                  ease-out
                  group-hover:scale-100
                  group-focus-within:scale-100
                "
              >
                {hoverActions?.map((action) => {
                  const toneStyle = HOVER_ACTION_TONE_STYLES[action.tone];
                  const ActionIcon = action.icon;

                  const content = (
                    <>
                      <ActionIcon size={15} strokeWidth={2} />
                      <span>{action.label}</span>
                    </>
                  );

                  const sharedProps = {
                    key: action.key,
                    "aria-label": action.ariaLabel ?? action.label,
                    title: action.ariaLabel ?? action.label,
                  };

                  return action.href ? (
                    <Link
                      {...sharedProps}
                      href={action.href}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold whitespace-nowrap shadow-sm transition-transform duration-150 hover:scale-[1.03] active:scale-[0.97]"
                      style={toneStyle}
                    >
                      {content}
                    </Link>
                  ) : (
                    <motion.button
                      {...sharedProps}
                      type="button"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                      disabled={action.pending || action.disabled}
                      onClick={action.onClick}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold whitespace-nowrap shadow-sm disabled:opacity-50 disabled:pointer-events-none"
                      style={toneStyle}
                    >
                      {action.pending ? (
                        <span>…</span>
                      ) : (
                        content
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}
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

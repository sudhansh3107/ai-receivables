"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Sparkles,
} from "lucide-react";

import Card from "../ui/Card";

const insights = [
  {
    noticed:
      "ABC Industries has consistently paid within 48 hours after the second reminder over the last four invoices.",
    action:
      "Continue Reminder Stage 2. Escalate only if payment is not received within 5 days.",
  },
  {
    noticed:
      "Global Solutions has requested payment extensions on three consecutive invoices, indicating a recurring cash flow issue.",
    action:
      "Approve the current extension request, but require manual approval for future invoices.",
  },
  {
    noticed:
      "Three overdue customers account for nearly 42% of all outstanding receivables this month.",
    action:
      "Prioritize direct outreach before initiating automated escalation workflows.",
  },
  {
    noticed:
      "TechNova has paid every invoice before its due date during the past six months.",
    action:
      "Reduce reminder frequency to improve customer experience while maintaining payment behaviour.",
  },
  {
    noticed:
      "Collection performance is ahead of last month despite fewer reminders being sent.",
    action:
      "Maintain the current reminder strategy. No workflow changes are recommended.",
  },
  {
    noticed:
      "Two invoices require your approval before settlement offers can be sent to customers.",
    action:
      "Review the pending approvals to prevent unnecessary collection delays.",
  },
];

export default function AIInsight() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % insights.length);
    }, 10000);

    return () => clearInterval(interval);
  }, []);

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

              <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">
                AI Insight
              </h2>

            </div>

            <div className="mt-7">

              <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#A48B6B]">
                Employee Noticed
              </p>

              <AnimatePresence mode="wait">

                <motion.p
                  key={`noticed-${current}`}
                  initial={{
                    opacity: 0,
                    y: 8,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  exit={{
                    opacity: 0,
                    y: -8,
                  }}
                  transition={{
                    duration: 0.35,
                  }}
                  className="mt-3 text-[15px] leading-8 text-[#2B2B2B]"
                >
                  {insights[current].noticed}
                </motion.p>

              </AnimatePresence>

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

              <AnimatePresence mode="wait">

                <motion.p
                  key={`action-${current}`}
                  initial={{
                    opacity: 0,
                    y: 8,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  exit={{
                    opacity: 0,
                    y: -8,
                  }}
                  transition={{
                    duration: 0.35,
                  }}
                  className="mt-4 text-[15px] leading-8 text-[#2B2B2B]"
                >
                  {insights[current].action}
                </motion.p>

              </AnimatePresence>

              <div className="my-5 h-px bg-[#EFE8E0]" />

              <div>

                <p className="text-[12px] font-medium text-[#8C857C]">
                  Updated just now
                </p>

                <p className="mt-1 text-[11px] text-[#A7A199]">
                  Reviewing customer behaviour continuously
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
"use client";

import { motion } from "motion/react";
import {
  ArrowRight,
  ChevronRight,
  Sparkles,
  Quote,
} from "lucide-react";

import Card from "../ui/Card";

export default function AIInsight() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
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

          <div className="col-span-7 px-3 py-2">

            {/* Header */}

            <div className="flex items-center gap-2">

              <Sparkles
                size={28}
                strokeWidth={1.5}
                color="#8F6B4A"
              />

              <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">
                AI Insights
              </h2>

            </div>

            {/* Quote */}

            <Quote
              size={18}
              strokeWidth={2}
              className="mt-5 text-[#D5CDC4]"
            />

            {/* Insight */}

            <p className="mt-2 text-[15px] leading-8 text-[#2B2B2B]">
              Collection performance improved by{" "}
              <span className="font-semibold">
                18%
              </span>{" "}
              this week. ABC Industries continues to
              delay payments by an average of{" "}
              <span className="font-semibold">
                9 days
              </span>.
            </p>

          </div>

          {/* Right */}

          <div className="col-span-5 flex flex-col border-l border-[#EFE8E0] px-2 py-4">

            <div className="flex items-center justify-between">

              <div className="flex items-center gap-2">

                <h3 className="text-[16px] font-semibold text-[#1A1A1A]">
                  Recommendation
                </h3>

                <div className="h-2 w-2 rounded-full bg-[#6E8F63]" />

              </div>

              

            </div>

            <p className="mt-2 text-[15px] leading-7 text-[#2B2B2B]">
              Escalate future invoices after
              the second reminder.
            </p>

            <button className="mt-auto flex items-center gap-2 text-[15px] font-semibold text-[#2B211A] transition hover:text-[#8F6B4A]">

              View full insight

              <ArrowRight
                size={16}
                strokeWidth={1.5}
              />

            </button>

          </div>
<ChevronRight
                size={12}
                strokeWidth={2}
                color="#7D7D7D"
              />
        </div>
      </Card>
    </motion.div>
  );
}
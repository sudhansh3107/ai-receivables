"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  Clock3,
} from "lucide-react";

import Card from "../ui/Card";

const progress = 68;

const workItems = [
  "Reminder Stage 2",
  "Settlement Reviews",
  "Customer Follow-ups",
];

export default function MissionCard() {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setWidth(progress);
    }, 300);

    return () => clearTimeout(timer);
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
        className="overflow-hidden dashboard-card rounded-[30px] p-0"
        style={{
          background: "#E8DAC7",
          border: "1px solid #DCCAB4",
        }}
      >
        <div className="flex min-h-[360px] flex-col px-1 py-1">

          {/* Header */}

          <div>

            <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#8D745A]">
              Current Mission
            </p>

            <h2 className="mt-3 text-[32px] font-semibold leading-[40px] tracking-[-0.04em] text-[#1F1B18]">
              Recover ₹3.2M Today
            </h2>

            <p className="mt-3 text-[14px] leading-7 text-[#5C5148]">
              The employee is prioritising overdue customers
              with the highest payment probability.
            </p>

          </div>

          {/* Progress */}

          <div className="mt-7">

            <div className="mb-3 flex items-center justify-between">

              <span className="text-[14px] font-medium text-[#5E554D]">
                Mission Progress
              </span>

              <span className="text-[15px] font-semibold text-[#2B211A]">
                {progress}%
              </span>

            </div>

            <div className="h-[8px] overflow-hidden rounded-full bg-[#D4C1AC]">

              <motion.div
                initial={{
                  width: 0,
                }}
                animate={{
                  width: `${width}%`,
                }}
                transition={{
                  duration: 2.2,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="h-full rounded-full bg-[#2B211A]"
              />

            </div>

            <p className="mt-3 text-[13px] text-[#6B6158]">
              17 of 25 invoices completed today
            </p>

          </div>

          <div className="my-4 h-px bg-[#D9C8B3]" />

          {/* Working On */}

          <div>

            <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#8D745A]">
              Working On
            </p>

            <div className="mt-4 space-y-4">

              {workItems.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3"
                >
                  <div className="h-2.5 w-2.5 rounded-full bg-[#B88A4B]" />

                  <span className="text-[15px] font-medium text-[#2B211A]">
                    {item}
                  </span>

                </div>
              ))}

            </div>

          </div>

          <div className="mt-3">

            <div className="h-px bg-[#D9C8B3]" />

            {/* Estimated Completion */}

            <div className="mt-4 flex items-center justify-between">

              <div>

                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#8D745A]">
                  Estimated Completion
                </p>

                <p className="mt-3 text-[16px] font-semibold text-[#1F1B18]">
                  Today • 5:30 PM
                </p>

                <p className="mt-2 text-[13px] leading-6 text-[#6B6158]">
                  Based on current customer response
                  patterns and payment history.
                </p>

              </div>

              <div className="flex h-6 w-12 items-center justify-center rounded-2xl bg-[#F4EBE0]">

                <Clock3
                  size={25}
                  strokeWidth={1.8}
                  color="#8D745A"
                />

              </div>

            </div>

            {/* Footer */}

            <button
              className="
                mt-3
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
              View mission details

              <ArrowUpRight
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
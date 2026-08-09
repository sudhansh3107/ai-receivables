"use client";

import { motion } from "motion/react";
import { Compass } from "lucide-react";

import Card from "../ui/Card";

export default function MissionCard() {
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
        className="flex min-h-[360px] flex-col overflow-hidden dashboard-card rounded-[30px] p-0"
        style={{
          background: "#E8DAC7",
          border: "1px solid #DCCAB4",
        }}
      >
        <div className="flex flex-1 flex-col items-start justify-center px-8 py-8">

          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F4EBE0]">

            <Compass
              size={20}
              strokeWidth={1.8}
              color="#8D745A"
            />

          </div>

          <p className="mt-6 text-[13px] font-semibold uppercase tracking-[0.18em] text-[#8D745A]">
            Current Mission
          </p>

          <h2 className="mt-3 text-[22px] font-semibold leading-[30px] tracking-[-0.02em] text-[#1F1B18]">
            Mission tracking isn&apos;t available yet
          </h2>

          <p className="mt-3 text-[14px] leading-7 text-[#5C5148]">
            I don&apos;t yet have a daily target to measure progress
            against. This card will show real mission tracking once
            that capability is built.
          </p>

        </div>

      </Card>

    </motion.div>
  );
}

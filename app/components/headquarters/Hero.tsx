"use client";

import { motion } from "motion/react";

import HeroContent from "./HeroContent";
import MetricsPanel from "./MetricsPanel";

export default function Hero() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="-mt-3"
    >
      <div className="flex items-start justify-between gap-14">

        {/* Left Hero */}

        <div className="w-[400px] shrink-0 -mt-5">
          <HeroContent />
        </div>

        {/* Right Metrics */}

        <div className="flex-1">
          <MetricsPanel />
        </div>

      </div>
    </motion.section>
  );
}
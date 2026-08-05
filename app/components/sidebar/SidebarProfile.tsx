"use client";

import { ChevronsUpDown } from "lucide-react";
import { motion } from "motion/react";

export default function SidebarProfile() {
  return (
    <motion.button
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.18 }}
      className="flex w-full items-center rounded-2xl border border-white/5 bg-[#151515] px-3 py-3"
    >
      {/* Avatar */}
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#A27C55] to-[#6C4F33] text-sm font-semibold text-white">
        A
      </div>

      {/* User */}
      <div className="ml-3 flex-1 text-left">
        <p className="text-[14px] font-semibold leading-none text-[#F5EFE7]">
          Arjun Mehta
        </p>

        <p className="mt-1 text-[12px] leading-none text-[#8D8D8D]">
          Acme Corp
        </p>
      </div>

      {/* Chevron */}
      <ChevronsUpDown
        size={16}
        strokeWidth={1.8}
        className="text-[#8D8D8D]"
      />
    </motion.button>
  );
}
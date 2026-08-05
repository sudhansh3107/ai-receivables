"use client";

import Link from "next/link";
import { LucideIcon } from "lucide-react";
import { motion } from "motion/react";

interface SidebarItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
}

export default function SidebarItem({
  href,
  label,
  icon: Icon,
  active = false,
}: SidebarItemProps) {
  return (
    <Link href={href}>
      <motion.div
        whileHover={{
          x: 2,
          backgroundColor: active ? "#4A3927" : "#1C1C1C",
        }}
        transition={{
          duration: 0.2,
          ease: "easeOut",
        }}
        className="group relative flex h-12 items-center rounded-2xl px-4"
        style={{
          backgroundColor: active ? "#4A3927" : "rgba(255,255,255,0)",
        }}
      >
        <Icon
          size={18}
          strokeWidth={1.8}
          className={`transition-colors duration-200 ${
            active
              ? "text-[#F7F3EE]"
              : "text-[#8F8F8F] group-hover:text-white"
          }`}
        />

        <span
          className={`ml-3 text-[14px] font-medium tracking-[-0.02em] transition-colors duration-200 ${
            active
              ? "text-[#F7F3EE]"
              : "text-[#B7B7B7] group-hover:text-white"
          }`}
        >
          {label}
        </span>
      </motion.div>
    </Link>
  );
}
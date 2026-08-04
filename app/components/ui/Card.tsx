"use client";

import { ReactNode } from "react";
import { motion } from "motion/react";
import { tokens } from "@/lib/theme/tokens";

interface CardProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}

export default function Card({
  children,
  className = "",
  interactive = false,
}: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={interactive ? { y: -2 } : undefined} 
      transition={{
        duration: 0.25,
        ease: "easeOut",
      }}
      className={`
        border
        p-6
        transition-all
        duration-300
        ${className}
      `}
      style={{
        backgroundColor: tokens.semantic.card,
        borderColor: tokens.semantic.border,
        borderRadius: tokens.radius.lg,
        boxShadow: tokens.shadows.sm,
      }}
    >
      {children}
    </motion.div>
  );
}
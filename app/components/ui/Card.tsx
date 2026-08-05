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
      whileHover={
        interactive
          ? {
              y: -4,
              boxShadow: tokens.shadows.lg,
            }
          : undefined
      }
      transition={{
        duration: 0.25,
        ease: "easeOut",
      }}
      className={className}
      style={{
        background: tokens.semantic.surface,
        border: `1px solid ${tokens.semantic.border}`,
        borderRadius: tokens.radius.xl,
        boxShadow: tokens.shadows.md,
        padding: tokens.layout.cardPadding,
        transition: `all ${tokens.motion.normal} ease`,
      }}
    >
      {children}
    </motion.div>
  );
}
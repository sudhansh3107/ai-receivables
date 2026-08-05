"use client";

import { ReactNode } from "react";
import { motion, HTMLMotionProps } from "motion/react";

import { tokens } from "@/lib/theme/tokens";

interface ButtonProps extends HTMLMotionProps<"button"> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export default function Button({
  children,
  variant = "secondary",
  className = "",
  ...props
}: ButtonProps) {
 const styles = {
  primary: {
    background: tokens.brand.primary,
    color: tokens.colors.white,
    border: "none",
  },

  secondary: {
    background: "transparent",
    color: tokens.semantic.textPrimary,
    border: `1px solid ${tokens.semantic.border}`,
  },

  ghost: {
    background: "transparent",
    color: tokens.semantic.textPrimary,
    border: "none",
  },

  danger: {
    background: tokens.semantic.danger,
    color: tokens.colors.white,
    border: "none",
  },
};

  return (
    <motion.button
      whileHover={
        variant === "secondary"
          ? {
              y: -1,
              backgroundColor: tokens.brand.primary,
              color: tokens.colors.white,
              borderColor: tokens.brand.primary,
            }
          : {
              y: -1,
            }
      }
      whileTap={{
        scale: 0.98,
      }}
      transition={{
        duration: 0.18,
      }}
      className={`
        inline-flex
        items-center
        gap-2
        h-10
        px-5
        rounded-xl
        text-sm
        font-medium
        whitespace-nowrap
        cursor-pointer
        transition-all
        duration-200
        ${className}
      `}
      style={{
        boxShadow: "none",
        ...styles[variant],
      }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
"use client";

import { motion } from "motion/react";
import { tokens } from "@/lib/theme/tokens";

import { ReactNode } from "react";
import { HTMLMotionProps } from "motion/react";

interface ButtonProps extends HTMLMotionProps<"button"> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export default function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  const styles = {
    primary: {
      backgroundColor: tokens.brand.primary,
      color: tokens.colors.white,
      border: "none",
    },

    secondary: {
      backgroundColor: tokens.colors.white,
      color: tokens.semantic.textPrimary,
      border: `1px solid ${tokens.semantic.border}`,
    },

    ghost: {
      backgroundColor: "transparent",
      color: tokens.semantic.textPrimary,
      border: "none",
    },

    danger: {
      backgroundColor: tokens.semantic.danger,
      color: tokens.colors.white,
      border: "none",
    },
  };

  return (
    <motion.button
      whileHover={{
        scale: 1.02,
      }}
      whileTap={{
        scale: 0.98,
      }}
      transition={{
        duration: 0.15,
      }}
      className={`
        inline-flex
        items-center
        justify-center
        rounded-xl
        px-5
        py-3
        text-sm
        font-semibold
        transition-all
        duration-200
        cursor-pointer
        disabled:opacity-50
        disabled:cursor-not-allowed
        ${className}
      `}
      style={{
        borderRadius: tokens.radius.md,
        boxShadow:
          variant === "primary"
            ? tokens.shadows.sm
            : "none",
        ...styles[variant],
      }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
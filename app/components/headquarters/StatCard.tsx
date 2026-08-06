"use client";

import { useEffect, useState } from "react";
import { animate, motion, useMotionValue } from "motion/react";
import { ArrowDown, ArrowUp, LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  iconColor: string;

  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;

  title: string;
  change?: string;
  subtitle?: string;
  trend?: "up" | "down";
}

function AnimatedCounter({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: Math.min(2.5, 0.8 + value * 0.12),
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        setDisplay(latest);
      },
    });

    return () => controls.stop();
  }, [value, motionValue]);

  const formatted =
  decimals > 0
    ? display.toFixed(decimals)
    : Math.round(display).toString();

  return (
    <h2
  className="
    flex
    items-baseline
    justify-center
    gap-[3px]
    text-[36px]
    font-medium
    leading-none
    tracking-[-0.045em]
    text-[#23201D]
  "
>
  {prefix && (
    <span className="opacity-85">
      {prefix}
    </span>
  )}

  <span>
    {formatted}
  </span>

  {suffix && (
    <span className="opacity-80">
      {suffix}
    </span>
  )}
</h2>
  );
}

export default function StatCard({
  icon: Icon,
  iconColor,
  value,
  prefix,
  suffix,
  decimals = 0,
  title,
  change,
  subtitle,
  trend,
}: StatCardProps) {
  return (
    <motion.div
      whileHover={{
        y: -2,
      }}
      transition={{
        duration: 0.25,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="
        flex
        h-full
        flex-col
        justify-center
        border-l
        border-[#E9E1D8]
        px-10
        py-10
        transition-all
        dashboard-card
        duration-300
        hover:border-[#DED1C3]
        hover:bg-[#FEFDFC]
        hover:shadow-[0_14px_30px_rgba(181,156,120,0.08)]
      "
    >

      {/* Icon */}

      <div className="flex justify-center">

        <motion.div
          whileHover={{
            rotate: -3,
          }}
          transition={{
            duration: 0.25,
          }}
          className="
            flex
            h-14
            w-14
            items-center
            justify-center
            rounded-full
            bg-[#F8F4EE]
            transition-shadow
            duration-300
            group-hover:shadow-[0_8px_18px_rgba(184,138,75,0.12)]
          "
        >
          <Icon
            size={45}
            strokeWidth={1.8}
            color={iconColor}
          />
        </motion.div>

      </div>

      {/* Content */}

      <div className="mt-7 flex flex-col items-center">

        <AnimatedCounter
          value={value}
          prefix={prefix}
          suffix={suffix}
          decimals={decimals}
          
        />

        <p className="mt-3 text-center text-[15px] font-medium text-[#2C2B29]">
          {title}
        </p>

        {change && (
  <div
    className="
      mt-2
      flex
      items-center
      justify-center
      gap-1.5
    "
  >
    {trend === "up" ? (
      <ArrowUp
        size={13}
        strokeWidth={2}
        className="flex-shrink-0 text-[#6E8F63]"
      />
    ) : (
      <ArrowDown
        size={13}
        strokeWidth={2}
        className="flex-shrink-0 text-[#C96D55]"
      />
    )}

    <span className="text-[11px] font-medium text-[#7D7D7D]">
      {change}
    </span>
  </div>
)}

        {subtitle && (
          <p className="mt-2 text-center text-[11px] leading-5 text-[#7D7D7D]">
            {subtitle}
          </p>
        )}

      </div>

    </motion.div>
  );
}
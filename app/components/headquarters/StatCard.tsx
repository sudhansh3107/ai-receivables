"use client";

import { ArrowDown, ArrowUp, LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  iconColor: string;
  value: string;
  title: string;
  change?: string;
  subtitle?: string;
  trend?: "up" | "down";
}

export default function StatCard({
  icon: Icon,
  iconColor,
  value,
  title,
  change,
  subtitle,
  trend,
}: StatCardProps) {
  return (
    <div className="flex flex-col justify-center border-l border-[#EFE9E2] px-8 pt-8 pb-7">

      {/* Icon */}
<div className="mb-8 flex justify-center">
  <div className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-[#F8F4EE]">
    <Icon
      size={30}
      strokeWidth={1.8}
      color={iconColor}
    />
  </div>
</div>

      {/* Value */}

      <h2 className="mt-6 text-[34px] font-medium leading-none tracking-[-0.03em] text-[#1B1B1B]">

        {value}

      </h2>

      {/* Title */}

      <p className="mt-2 text-[15px] font-medium text-[#2B2B2B]">

        {title}

      </p>

      {/* Change */}

      {change && (
        <div className="mt-3 flex items-center gap-1.5">

          {trend === "up" ? (
            <ArrowUp
              size={12}
              strokeWidth={2}
              className="text-[#6B8B61]"
            />
          ) : (
            <ArrowDown
              size={12}
              strokeWidth={2}
              className="text-[#C46D53]"
            />
          )}

          <span className="text-[12px] font-normal text-[#7B756F]">
            {change}
          </span>

        </div>
      )}

      {/* Subtitle */}

      {subtitle && (
        <span className="mt-3 text-[13px] leading-5 text-[#7C7670]">
          {subtitle}
        </span>
      )}

    </div>
  );
}
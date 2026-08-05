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
    <div className="flex h-full flex-col justify-center border-l border-[#E9E1D8] px-10 py-8">

      {/* Icon */}

      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F8F4EE]">
          <Icon
            size={45}
            strokeWidth={1.8}
            color={iconColor}
          />
        </div>
      </div>

      {/* Content */}

      <div className="mt-7 flex flex-col items-center">

        <h2 className="text-[30px] font-semibold leading-none tracking-[-0.03em] text-[#1A1A1A]">
          {value}
        </h2>

        <p className="mt-3 text-center text-[15px] font-medium text-[#2C2B29]">
          {title}
        </p>

        {change && (
          <div className="mt-1 flex items-center gap-2">

            {trend === "up" ? (
              <ArrowUp
                size={14}
                strokeWidth={2}
                className="text-[#6E8F63]"
              />
            ) : (
              <ArrowDown
                size={14}
                strokeWidth={2}
                className="text-[#C96D55]"
              />
            )}

            <span className="text-[11px] text-[#7D7D7D]">
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

    </div>
  );
}
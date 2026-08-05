"use client";

import { LucideIcon, ChevronRight } from "lucide-react";

interface DecisionItemProps {
  icon: LucideIcon;
  iconColor: string;
  iconBackground: string;

  title: string;
  company: string;
  subtitle: string;
}

export default function DecisionItem({
  icon: Icon,
  iconColor,
  iconBackground,
  title,
  company,
  subtitle,
}: DecisionItemProps) {
  return (
    <button
      className="
        group
        flex
        w-full
        items-center
        justify-between
        rounded-2xl
        border
        border-[#EFE8E0]
        bg-[#FCFAF7]
        p-4
        transition-all
        duration-200
        hover:bg-[#F8F4EE]
      "
    >
      {/* Left */}

      <div className="flex items-center gap-4">

        {/* Icon */}

        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{
            background: iconBackground,
          }}
        >
          <Icon
            size={20}
            strokeWidth={2}
            color={iconColor}
          />
        </div>

        {/* Text */}

        <div className="text-left">

          <h3 className="text-[13px] font-semibold leading-6 text-[#1A1A1A]">
            {title}
          </h3>

          <p className="text-[13px] font-semibold leading-6 text-[#1A1A1A]">
            {company}
          </p>

          <span className="mt-2 block text-[12px] text-[#6B645C]">
            {subtitle}
          </span>

        </div>

      </div>

      {/* Arrow */}

      <ChevronRight
        size={18}
        strokeWidth={2}
        className="
          text-[#7D7D7D]
          transition-transform
          duration-200
          group-hover:translate-x-1
        "
      />

    </button>
  );
}
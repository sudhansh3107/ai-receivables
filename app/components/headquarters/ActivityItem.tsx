"use client";

import { LucideIcon } from "lucide-react";

interface ActivityItemProps {
  time: string;
  icon: LucideIcon;
  iconColor: string;
  title: string;
  subtitle: string;
  status?: string;
}

export default function ActivityItem({
  time,
  icon: Icon,
  iconColor,
  title,
  subtitle,
  status = "Completed",
}: ActivityItemProps) {
  return (
    <div className="flex items-start justify-between py-4">

      {/* Left */}

      <div className="flex items-start gap-5">

        {/* Time */}

        <div className="w-[55px] pt-[11px]">

          <span className="text-[13px] font-medium text-[#7D7D7D]">
            {time}
          </span>

        </div>

        {/* Icon */}

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F8F4EE]">

          <Icon
            size={20}
            strokeWidth={1.9}
            color={iconColor}
          />

        </div>

        {/* Text */}

        <div className="pt-[4px]">

          <h3 className="text-[13px] font-semibold leading-none text-[#1A1A1A]">
            {title}
          </h3>

          <p className="mt-2 text-[12px] leading-none text-[#7D7D7D]">
            {subtitle}
          </p>

        </div>

      </div>

      {/* Status */}

      <div className="pt-[3px]">

        <span className="rounded-full bg-[#EAF4E8] px-3 py-[6px] text-[12px] font-medium text-[#6E8F63]">
          {status}
        </span>

      </div>

    </div>
  );
}
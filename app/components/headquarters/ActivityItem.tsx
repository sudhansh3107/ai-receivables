"use client";

import { LucideIcon } from "lucide-react";
import { motion } from "motion/react";

interface ActivityItemProps {
  time: string;
  icon: LucideIcon;
  iconColor: string;
  title: string;
  subtitle: string;
  status?: string;
  showLine?: boolean;
}

export default function ActivityItem({
  time,
  icon: Icon,
  iconColor,
  title,
  subtitle,
  status = "Completed",
  showLine = true,
}: ActivityItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.55,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={{
        y: -2,
      }}
      className="
        group
        cursor-pointer
        rounded-2xl
        px-3
        py-4
        transition-colors
        duration-300
        hover:bg-[#FCFAF7]
      "
    >
      <div className="flex items-start justify-between">

        {/* Left */}

        <div className="flex items-start gap-5">

          {/* Time */}

          <div className="w-[60px] pt-[11px] flex-shrink-0">
            <span className="text-[13px] font-medium text-[#8B847C]">
              {time}
            </span>
          </div>

          {/* Timeline + Icon */}

          <div className="relative flex w-11 justify-center flex-shrink-0">

            {showLine && (
              <div
                className="
                  absolute
                  top-10
                  left-1/2
                  h-16
                  w-[2px]
                  -translate-x-1/2
                  rounded-full
                  bg-gradient-to-b
                  from-[#E7DED3]
                  via-[#EEE6DD]
                  to-transparent
                  opacity-70
                "
              />
            )}

            <motion.div
              whileHover={{
                scale: 1.05,
              }}
              transition={{
                duration: 0.2,
              }}
              className="
                relative
                z-10
                flex
                h-10
                w-10
                items-center
                justify-center
                rounded-full
                bg-[#F8F4EE]
                transition-shadow
                duration-300
                group-hover:shadow-[0_6px_18px_rgba(184,138,75,0.12)]
              "
            >
              <Icon
                size={20}
                strokeWidth={1.9}
                color={iconColor}
              />
            </motion.div>

          </div>

          {/* Text */}

          <div className="max-w-[270px] pt-[1px]">

            <h3 className="text-[13px] font-semibold leading-[18px] tracking-[-0.01em] text-[#1A1A1A]">
              {title}
            </h3>

            <p className="mt-2 text-[12px] leading-[16px] text-[#7D7D7D]">
              {subtitle}
            </p>

          </div>

        </div>

        {/* Status */}

        <div className="flex min-h-[40px] items-center pl-4">

          <motion.div
            whileHover={{
              scale: 1.03,
            }}
          >
            <span
              className="
                rounded-full
                bg-[#EAF4E8]
                px-3
                py-[6px]
                text-[11px]
                font-medium
                text-[#6E8F63]
                transition-all
                duration-300
                group-hover:bg-[#E2F0DE]
              "
            >
              {status}
            </span>
          </motion.div>

        </div>

      </div>

    </motion.div>
  );
}
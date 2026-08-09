"use client";

import { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { tokens } from "@/lib/theme/tokens";

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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
                duration: 0.45,
                ease: [0.22, 1, 0.36, 1],
            }}
            whileHover={{
                y: -1,
            }}
            className="
                group
                cursor-pointer
                rounded-2xl
                px-3
                py-3
                transition-colors
                duration-300
                hover:bg-[#FCFAF7]
            "
        >
            <div className="flex items-start gap-5 pt-1">

                {/* Time */}
                <div className="w-[56px] flex-shrink-0 pt-[8px]">
                    <span className="text-[12px] font-medium text-[#8B847C]">
                        {time}
                    </span>
                </div>

                {/* Timeline + Icon */}
                <div className="relative flex w-9 flex-shrink-0 justify-center pt-2">

                    {showLine && (
                        <div
                            className="
                                absolute
                                left-1/2
                                top-9
                                h-14
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
                        whileHover={{ scale: 1.05 }}
                        transition={{ duration: 0.2 }}
                        className="
                            relative
                            z-10
                            flex
                            h-9
                            w-9
                            flex-shrink-0
                            items-center
                            justify-center
                            rounded-full
                            transition-shadow
                            duration-300
                            group-hover:shadow-[0_10px_28px_rgba(143,107,74,0.12)]
                        "
                        style={{
                            background: tokens.semantic.surfaceWarm,
                        }}
                    >
                        <Icon
                            size={18}
                            strokeWidth={1.9}
                            color={iconColor}
                        />
                    </motion.div>
                </div>

                {/* Content */}
                <div className="min-w-10 flex-1 pt-[1px]">

                    <h3 className="text-[13px] font-semibold leading-[17px] tracking-[-0.01em] text-[#1A1A1A]">
                        {title}
                    </h3>

                    <p className="mt-1 text-[11px] leading-[15px] text-[#7D7D7D]">
                        {subtitle}
                    </p>

                </div>

                {/* Status */}
                <div className="flex flex-shrink-0 items-start pt-[13px]">

                    <motion.div whileHover={{ scale: 1.03 }}>
                        <span
                            className="
                                whitespace-nowrap
                                rounded-full
                                bg-[#EAF4E8]
                                px-2.5
                                py-[5px]
                                text-[10px]
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
"use client";

import { motion } from "motion/react";
import {
  Bell,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";

import Button from "../ui/Button";

type TopBarProps = {
  onAssignWork: () => void;
};

export default function TopBar({
  onAssignWork,
}: TopBarProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="sticky top-0 z-50 bg-[#F8F5F1]"
    >
      <div className="mx-auto max-w-[1600px] px-10 pt-4 pb-0">

        {/* ROW 1 */}

        <div className="flex items-center justify-end gap-4">

          <button className="transition duration-200 hover:scale-105">

            <Search
              size={20}
              strokeWidth={1.9}
            />

          </button>

          <button className="relative transition duration-200 hover:scale-105">

            <Bell
              size={20}
              strokeWidth={1.9}
            />

            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#C96A50] text-[9px] font-semibold text-white">
              2
            </span>

          </button>

          {/* Assign Work */}

          <Button onClick={onAssignWork}>

            <div className="flex items-center gap-2">

              <Plus size={15} />

              <span className="text-[14px] font-medium">
                Assign Work
              </span>

            </div>

          </Button>

          {/* Ask Employee */}

          <Button>

            <div className="flex items-center gap-2">

              <Sparkles size={15} />

              <span className="text-[14px] font-medium">
                Ask Employee
              </span>

            </div>

          </Button>

        </div>

        {/* ROW 2 */}

        <div className="mt-2">

          <div className="flex items-center gap-3">

            <span className="text-[13px] font-medium tracking-[-0.01em] text-[#5D5853]">
              Accounts Receivable Employee
            </span>

            <div className="rounded-lg border border-[#ECE5DD] bg-[#F7F3EE] px-3 py-[6px]">

              <span className="text-[12px] font-medium text-[#66615B]">
                AR-01
              </span>

            </div>

          </div>

        </div>

      </div>
    </motion.header>
  );
}
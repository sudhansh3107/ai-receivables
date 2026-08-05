"use client";

import { motion } from "motion/react";
import { Check, Clock3 } from "lucide-react";

import Card from "../ui/Card";

export default function MissionCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card
        className="h-[500px] overflow-hidden rounded-[30px] p-0"
        style={{
          background: "#E8DAC7",
          border: "1px solid #DCCAB4",
        }}
      >
        <div className="flex h-full flex-col">

          {/* Top Content */}

          <div className="px-0 pt-0">

            <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-[#1A1A1A]">
              Today's Mission
            </h2>

            <div className="mt-8 space-y-5">

              <MissionItem
                completed
                text="Follow up with 12 customers"
              />

              <MissionItem
                completed
                text="Collect pending payments"
              />

              <MissionItem
                pending
                text="Resolve 3 escalations"
              />

            </div>

            <div className="mt-10">

              <div className="mb-2 flex items-center justify-between">

                <span className="text-[14px] text-[#5E554D]">
                  Progress
                </span>

                <span className="text-[14px] font-semibold text-[#2B211A]">
                  68%
                </span>

              </div>

              <div className="h-[6px] overflow-hidden rounded-full bg-[#CDBAA4]">

                <div
                  className="h-full rounded-full bg-[#2B211A]"
                  style={{
                    width: "68%",
                  }}
                />

              </div>

            </div>

          </div>

          {/* Illustration Placeholder */}

          <div
            className="mt-6 h-[250px] w-full"
            style={{
              background:
                "linear-gradient(180deg,#E3D2BC 0%, #D6BEA0 100%)",
            }}
          />

        </div>
      </Card>
    </motion.div>
  );
}

interface MissionItemProps {
  text: string;
  completed?: boolean;
  pending?: boolean;
}

function MissionItem({
  text,
  completed,
  pending,
}: MissionItemProps) {
  return (
    <div className="flex items-center gap-3">

      {completed && (
        <Check
          size={16}
          strokeWidth={2.2}
          color="#6E8F63"
        />
      )}

      {pending && (
        <Clock3
          size={16}
          strokeWidth={2}
          color="#A56B20"
        />
      )}

      <span className="text-[15px] font-medium text-[#2B211A]">
        {text}
      </span>

    </div>
  );
}
"use client";

import { motion } from "motion/react";
import {
  ArrowRight,
  FileWarning,
} from "lucide-react";

import Card from "../ui/Card";
import DecisionItem from "./DecisionItem";
import { useDashboard } from "@/app/hooks/useDashboard";

function formatInvoiceAmount(amount: number, currency: string) {
  const locale = currency === "INR" ? "en-IN" : "en-US";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amount);
}

export default function DecisionFeed() {
  const {
    dashboard,
    loading,
    error,
  } = useDashboard();

  if (loading || error || !dashboard) {
    return null;
  }

  const { approvals } = dashboard;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="h-full"
    >
      <Card
        className="flex h-[410px] flex-col rounded-[30px] p-0"
        style={{
          background: "#FFFFFF",
          border: "1px solid #E6DED4",
        }}
      >
        {/* Header */}

        <div className="flex items-center justify-between px-3 py-2">

          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[#1A1A1A]">
            Needs Your Review
          </h2>

          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FBE8E6]">

            <span className="text-[13px] font-semibold text-[#C96D55]">
              {approvals.length}
            </span>

          </div>

        </div>

        {/* Feed */}

        {approvals.length > 0 ? (
          <div className="mt-3 space-y-4 px-3">

            {approvals.map((invoice) => (
              <DecisionItem
                key={invoice.id}
                icon={FileWarning}
                iconColor="#C96D55"
                iconBackground="#FBE8E6"
                title="Low-confidence extraction"
                company={invoice.customerName}
                subtitle={`Invoice ${invoice.invoiceNumber} · ${formatInvoiceAmount(
                  invoice.amount,
                  invoice.currency
                )}`}
                reasons={invoice.confidenceReasons}
              />
            ))}

          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center px-8 text-center">

            <p className="text-[14px] leading-6 text-[#8C857C]">
              No invoices need your review right now.
            </p>

          </div>
        )}

        {/* Footer */}

        <button
          disabled
          title="Approvals isn't available yet"
          className="
            mt-4
            flex
            cursor-not-allowed
            items-center
            gap-2
            px-7
            py-4
            text-[15px]
            font-semibold
            text-[#B3ABA0]
          "
        >
          View all approvals

          <ArrowRight
            size={17}
            strokeWidth={2}
          />

        </button>

      </Card>
    </motion.div>
  );
}
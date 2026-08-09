"use client";

import {
  TrendingUp,
  Wallet,
  CalendarDays,
  UserRoundCheck,
} from "lucide-react";

import StatCard from "./StatCard";

import { useDashboard } from "@/app/hooks/useDashboard";
import { formatCompactNumber } from "@/lib/formatters/number";

export default function MetricsPanel() {
  const {
    dashboard,
    loading,
    error,
  } = useDashboard();

  if (loading || error || !dashboard) {
    return null;
  }

  const { metrics } = dashboard;

  const cashRecovered = formatCompactNumber(
    metrics.cashRecovered.value
  );

  const outstanding = formatCompactNumber(
    metrics.outstanding.value
  );

  return (
    <div className="overflow-hidden rounded-[26px] border border-[#ECE5DD] bg-[#FCFBF8] shadow-[0_10px_30px_rgba(0,0,0,0.03)]">

      <div className="grid grid-cols-4">

        <StatCard
          icon={TrendingUp}
          iconColor="#A47A45"
          prefix="₹"
          value={cashRecovered.value}
          suffix={cashRecovered.suffix}
          decimals={cashRecovered.decimals}
          title="Cash Recovered"
          change={`${Math.abs(
            metrics.cashRecovered.change
          ).toFixed(1)}% vs last month`}
          trend={
            metrics.cashRecovered.change >= 0
              ? "up"
              : "down"
          }
        />

        <StatCard
          icon={Wallet}
          iconColor="#6C6257"
          prefix="₹"
          value={outstanding.value}
          suffix={outstanding.suffix}
          decimals={outstanding.decimals}
          title="Outstanding"
          subtitle="Insights Coming Soon"
        />

        <StatCard
          icon={CalendarDays}
          iconColor="#D06F52"
          value={metrics.overdueInvoices.value}
          title="Overdue Invoices"
          subtitle="Insights Coming Soon"
        />
      

        <StatCard
          icon={UserRoundCheck}
          iconColor="#B7852E"
          value={metrics.needsReview}
          title="Needs Review"
          subtitle="Pending decisions"
        />

      </div>

    </div>
  );
}
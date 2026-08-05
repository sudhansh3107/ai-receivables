"use client";

import {
  TrendingUp,
  Wallet,
  CalendarDays,
  UserRoundCheck,
} from "lucide-react";

import StatCard from "./StatCard";

export default function MetricsPanel() {
  return (
   <div className="overflow-hidden rounded-[26px] border border-[#ECE5DD] bg-[#FCFBF8] shadow-[0_10px_30px_rgba(0,0,0,0.03)]">

      <div className="grid grid-cols-4">

        <StatCard
          icon={TrendingUp}
          iconColor="#A47A45"
          value="₹12.8M"
          title="Cash Recovered"
          change="18% vs last month"
          trend="up"
        />

        <StatCard
          icon={Wallet}
          iconColor="#6C6257"
          value="₹4.2M"
          title="Outstanding"
          change="7% vs last month"
          trend="down"
        />

        <StatCard
          icon={CalendarDays}
          iconColor="#D06F52"
          value="24"
          title="Overdue Invoices"
          change="6 vs last month"
          trend="down"
        />

        <StatCard
          icon={UserRoundCheck}
          iconColor="#B7852E"
          value="2"
          title="Needs Approval"
          subtitle="Pending decisions"
        />

      </div>

    </div>
  );
}
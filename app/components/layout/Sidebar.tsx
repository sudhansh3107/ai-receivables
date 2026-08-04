"use client";

import { motion } from "motion/react";
import {
  Activity,
  BarChart3,
  Bot,
  Building2,
  Settings,
  UserCircle2,
  Users,
} from "lucide-react";

import SidebarItem from "./SidebarItem";
import SidebarSection from "./SidebarSection";
import { tokens } from "@/lib/theme/tokens";

export default function Sidebar() {
  return (
    <motion.aside
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-screen w-72 flex-col border-r p-6"
      style={{
        backgroundColor: tokens.semantic.surface,
        borderColor: tokens.semantic.border,
      }}
    >
      {/* Logo */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: tokens.employees.orion.background,
            }}
          >
            <Building2
              size={24}
              color={tokens.employees.orion.accent}
            />
          </div>

          <div>
            <h1
              className="text-lg font-bold"
              style={{
                color: tokens.semantic.textPrimary,
              }}
            >
              VSB Labs
            </h1>

            <p
              className="text-sm"
              style={{
                color: tokens.semantic.textMuted,
              }}
            >
              Digital Workforce
            </p>
          </div>
        </div>
      </div>

      {/* Headquarters */}
      <div className="mb-8">
        <SidebarItem
          icon={Building2}
          title="Headquarters"
          active
        />
      </div>

      {/* AI Employees */}
      <SidebarSection title="AI Employees">
        <SidebarItem
          icon={Bot}
          title="Orion"
          subtitle="Accounts Receivable"
          status="Working"
          active
        />

        <SidebarItem
          icon={Bot}
          title="Atlas"
          subtitle="Coming Soon"
        />

        <SidebarItem
          icon={Bot}
          title="Lyra"
          subtitle="Coming Soon"
        />

        <SidebarItem
          icon={Bot}
          title="Nova"
          subtitle="Coming Soon"
        />
      </SidebarSection>

      {/* Organization */}
      <SidebarSection title="Organization">
        <SidebarItem
          icon={Users}
          title="Customers"
        />

        <SidebarItem
          icon={BarChart3}
          title="Analytics"
        />

        <SidebarItem
          icon={Activity}
          title="Activity"
        />

        <SidebarItem
          icon={Settings}
          title="Settings"
        />
      </SidebarSection>

      {/* Push profile to bottom */}
      <div className="flex-1" />

      {/* Profile */}
      <div
        className="border-t pt-6"
        style={{
          borderColor: tokens.semantic.border,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{
              backgroundColor: tokens.semantic.hover,
            }}
          >
            <UserCircle2
              size={24}
              color={tokens.semantic.textSecondary}
            />
          </div>

          <div>
            <p
              className="font-semibold"
              style={{
                color: tokens.semantic.textPrimary,
              }}
            >
              Sudhansh
            </p>

            <p
              className="text-sm"
              style={{
                color: tokens.semantic.textMuted,
              }}
            >
              Founder
            </p>
          </div>
        </div>
      </div>
    </motion.aside>
  );
}
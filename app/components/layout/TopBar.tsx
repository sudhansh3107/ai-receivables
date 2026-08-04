"use client";

import { motion } from "motion/react";
import {
  Bell,
  Search,
  Sparkles,
  UserCircle2,
} from "lucide-react";

import Button from "../ui/Button";
import { tokens } from "@/lib/theme/tokens";

export default function TopBar() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex items-center justify-between border-b px-8 py-6"
      style={{
        backgroundColor: tokens.semantic.surface,
        borderColor: tokens.semantic.border,
      }}
    >
      {/* Left */}
      <div>
        <h1
          className="text-3xl font-bold"
          style={{
            color: tokens.semantic.textPrimary,
          }}
        >
          Headquarters
        </h1>

        <p
          className="mt-1 text-sm"
          style={{
            color: tokens.semantic.textMuted,
          }}
        >
          Your Digital Workforce is active.
        </p>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">

        {/* Search */}
        <div
          className="flex w-72 items-center gap-2 rounded-xl border px-4 py-3"
          style={{
            borderColor: tokens.semantic.border,
            backgroundColor: tokens.semantic.surface,
          }}
        >
          <Search
            size={18}
            color={tokens.semantic.textMuted}
          />

          <input
            placeholder="Search invoices, customers..."
            className="w-full bg-transparent outline-none"
          />
        </div>

        {/* Notification */}
        <button
          className="rounded-xl border p-3"
          style={{
            borderColor: tokens.semantic.border,
          }}
        >
          <Bell
            size={20}
            color={tokens.semantic.textSecondary}
          />
        </button>

        {/* Ask Orion */}
        <Button>
          <Sparkles size={18} />

          Ask Orion
        </Button>

        {/* Profile */}
        <button
          className="rounded-full border p-2"
          style={{
            borderColor: tokens.semantic.border,
          }}
        >
          <UserCircle2
            size={28}
            color={tokens.semantic.textSecondary}
          />
        </button>

      </div>
    </motion.header>
  );
}
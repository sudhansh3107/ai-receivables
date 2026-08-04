"use client";

import { ReactNode } from "react";
import { tokens } from "@/lib/theme/tokens";

interface SidebarSectionProps {
  title: string;
  children: ReactNode;
}

export default function SidebarSection({
  title,
  children,
}: SidebarSectionProps) {
  return (
    <section className="mb-8">
      <h2
        className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider"
        style={{
          color: tokens.semantic.textMuted,
        }}
      >
        {title}
      </h2>

      {children}
    </section>
  );
}
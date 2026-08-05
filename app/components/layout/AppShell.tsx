"use client";

import { ReactNode } from "react";

import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

import { tokens } from "@/lib/theme/tokens";

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({
  children,
}: AppShellProps) {
  return (
    <main
      className="flex min-h-screen"
      style={{
        backgroundColor: tokens.semantic.background,
      }}
    >
      {/* Sidebar */}
      <Sidebar />

      {/* Main Area */}
      <div
        className="flex flex-1 flex-col"
        style={{
          backgroundColor: tokens.semantic.background,
        }}
      >
        <TopBar />

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </main>
  );
}
"use client";

import { ReactNode } from "react";

import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

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
        backgroundColor: "#F8FAFC",
      }}
    >
      {/* Sidebar */}
      <Sidebar />

      {/* Main Area */}
      <div className="flex flex-1 flex-col">

        <TopBar />

        <div className="flex-1 p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </div>

      </div>
    </main>
  );
}
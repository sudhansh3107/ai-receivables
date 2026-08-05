"use client";

import Sidebar from "../sidebar/Sidebar";
import TopBar from "./TopBar";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen overflow-hidden bg-[#F8F5F2]">

      {/* Fixed Sidebar */}

      <div className="fixed left-0 top-0 z-50 h-screen w-64">
        <Sidebar />
      </div>

      {/* Main Area */}

      <div className="ml-64 flex h-screen flex-col">

        {/* Fixed Top Bar */}

        <div className="sticky top-0 z-40">
          <TopBar />
        </div>

        {/* Scrollable Content */}

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

      </div>

    </div>
  );
}
"use client";

import Sidebar from "../sidebar/Sidebar";
import TopBar from "./TopBar";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[#F8F5F2]">

      <Sidebar />

      <div className="flex flex-1 flex-col">

        <TopBar />

        {children}

      </div>

    </div>
  );
}
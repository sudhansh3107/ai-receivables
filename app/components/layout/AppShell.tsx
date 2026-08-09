"use client";

import { useState } from "react";

import Sidebar from "../sidebar/Sidebar";
import TopBar from "./TopBar";

import NewInvoiceModal from "../invoice/NewInvoiceModal";
import { tokens } from "@/lib/theme/tokens";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [showNewInvoiceModal, setShowNewInvoiceModal] =
    useState(false);

  return (
    <div
      className="h-screen overflow-hidden"
      style={{
        background: tokens.semantic.background,
      }}
    >

      {/* Fixed Sidebar */}

      <div className="fixed left-0 top-0 z-50 h-screen w-64">
        <Sidebar />
      </div>

      {/* Main Area */}

      <div className="ml-64 flex h-screen flex-col">

        {/* Fixed Top Bar */}

        <div className="sticky top-0 z-40">
          <TopBar
            onAssignWork={() =>
              setShowNewInvoiceModal(true)
            }
          />
        </div>

        {/* Scrollable Content */}

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

      </div>

      {showNewInvoiceModal && (
        <NewInvoiceModal
          onClose={() =>
            setShowNewInvoiceModal(false)
          }
        />
      )}

    </div>
  );
}
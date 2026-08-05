"use client";

import { useEffect, useState } from "react";

import Page from "./components/ui/page";

import MissionControl from "./components/dashboard/MissionControl";
import MissionCard from "./components/dashboard/MissionCard";
import DigitalEmployee from "./components/dashboard/DigitalEmployee";
import QuickActions from "./components/dashboard/QuickActions";
import ActivityTimeline from "./components/dashboard/ActivityTimeline";

import LoadingState from "./components/shared/LoadingState";
import { buildDashboardStats } from "./components/dashboard/stats";

import NewInvoiceModal from "./components/invoice/NewInvoiceModal";

import { supabase } from "../lib/supabase";
import type { Invoice } from "./types/invoice";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isNewInvoiceOpen, setIsNewInvoiceOpen] = useState(false);

  const dashboardStats = buildDashboardStats(invoices);

  useEffect(() => {
    async function fetchInvoices() {
      try {
        const { data, error } = await supabase
          .from("invoices")
          .select(`
            *,
            customers (
              company_name
            )
          `)
          .order("invoice_number", { ascending: true });

        if (error) throw error;

        setInvoices(data ?? []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    fetchInvoices();
  }, []);

  if (loading) {
    return <LoadingState message="Loading Digital Employee..." />;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-8 py-8">
      <div className="mx-auto max-w-7xl">
        <Page>
          <MissionControl stats={dashboardStats} />

          <QuickActions />

          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-4">
              <MissionCard />
            </div>

            <div className="col-span-8">
              <DigitalEmployee />
            </div>
          </div>

          <ActivityTimeline />

          {isNewInvoiceOpen && (
            <NewInvoiceModal
              onClose={() => setIsNewInvoiceOpen(false)}
            />
          )}
        </Page>
      </div>
    </main>
  );
}
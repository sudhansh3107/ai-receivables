"use client";

import { useEffect, useState } from "react";
import Header from "./components/Header";
import LoadingState from "./components/LoadingState";
import EmptyState from "./components/EmptyState";
import InvoiceList from "./components/InvoiceList";
import { supabase } from "../lib/supabase";
import type { Invoice } from "./types/invoice";
import SearchBar from "./components/SearchBar";
import NewInvoiceModal from "./components/NewInvoiceModal";

export default function Home() {
  const [invoicesProcessed, setInvoicesProcessed] = useState(0);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearch = searchTerm.toLowerCase();
  const filteredInvoices = invoices.filter((invoice) => {
    return invoice.customers?.company_name
        .toLowerCase()
        .includes(normalizedSearch);
  });
  const [isNewInvoiceOpen, setIsNewInvoiceOpen] = useState(false);
  const openNewInvoiceModal = () => {
   setIsNewInvoiceOpen(true);
  };

  useEffect(() => {
    async function fetchInvoices() {
      try {
        // Artificial delay so we can see the loading screen
        await new Promise((resolve) => setTimeout(resolve, 100));

       const { data, error } = await supabase
    .from("invoices")
    .select(`
        *,
        customers (
            company_name
        )
    `)
    .order("invoice_number", { ascending: true });

        if (error) {
          throw error;
        }

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
    return <LoadingState message="Loading invoices..." />;
  }

 {invoices.length === 0 && (
  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-gray-600">
    No invoices yet. Upload one to get started.
  </div>
)}

  return (
    <main className="p-8 space-y-6">
      <Header name = "Accounts Receivable Dashboard" onNewInvoiceClick={openNewInvoiceModal} />
      <div>
        {isNewInvoiceOpen && (
    <NewInvoiceModal
        onClose={() => setIsNewInvoiceOpen(false)}
    />
)}
      </div>
      <div> 
        <SearchBar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        /> 
      </div>
      

      <div>
        <h2 className="text-2xl font-bold">
          AI Accounts Receivable Employee
        </h2>

       </div>

      <div>
        <h3 className="mb-4 text-xl font-semibold">
          Recent Invoices
        </h3>

        <InvoiceList invoices={filteredInvoices} />
      </div>
    </main>
  );
}
import InvoiceCard from "./InvoiceCard";
import type { Invoice } from "../types/invoice";

type InvoiceListProps = {
  invoices: Invoice[];
};

export default function InvoiceList({
  invoices,
}: InvoiceListProps) {
  return (
    <div className="space-y-4">
      {invoices.map((invoice) => (
        <InvoiceCard
          key={invoice.id}
          invoice={invoice}
        />
      ))}
    </div>
  );
}
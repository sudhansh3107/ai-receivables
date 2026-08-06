import type { Invoice } from "@/app/types/invoice";

type InvoiceCardProps = {
  invoice: Invoice;
};

export default function InvoiceCard({ invoice }: InvoiceCardProps) {
  const locale = invoice.currency === "INR" ? "en-IN" : "en-US";
  console.log(invoice.currency,locale);
  return (
    
    <div className="
     rounded-xl
    border-2
    border-gray-300
    bg-white
    p-5
    cursor-pointer
    ease-in-out
    transition-all
    duration-200
    hover:bg-gray-50
    hover:border-gray-500
  ">
      <p>Invoice Number: {invoice.invoice_number}</p>
      <p>Company Name: {invoice.customers?.company_name}</p>
     <p>
  Amount:{" "}
  {new Intl.NumberFormat(locale, {
    style: "currency",
    currency: invoice.currency,
      }).format(invoice.invoice_amount)}
</p>
      <p>Status: {invoice.status}</p>
    </div>
  );
}
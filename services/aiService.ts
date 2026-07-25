interface ExtractInvoiceResponse {
  invoice_number: string;
  vendor_name: string;
  vendor_email?: string;
  invoice_date: string;
  due_date: string;
  invoice_total: number;
  currency: string;
  ai_confidence: number;
  ai_status: "Pending Review" | "Reviewed";
}

export async function extractInvoice(filePath: string) {
  const response = await fetch("/api/extract-invoice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filePath }),
  });

  if (!response.ok) {
    throw new Error("Failed to extract invoice");
  }

  return response.json();
}
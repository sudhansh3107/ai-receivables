"use server";

import { processInvoice } from "@/services/processingengine";

export async function processInvoiceAction(invoiceFileId: string) {
  return processInvoice(invoiceFileId);
}
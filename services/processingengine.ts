import { getInvoiceFile } from "./invoiceFileService";
import { extractInvoice } from "./server/invoiceExtractionService";
import { findOrCreateCustomer } from "./server/customerService";

export async function processInvoice(invoiceFileId: string) {

    console.log("=================================");
    console.log("🚀 Starting Invoice Processing");

    const invoiceFile =
        await getInvoiceFile(invoiceFileId);

    const extractedInvoice =
        await extractInvoice(invoiceFile.storage_path);

    console.log("📄 Extracted Invoice");
    console.log(extractedInvoice);

    const customer =
        await findOrCreateCustomer(extractedInvoice);

    console.log("👤 Customer");
    console.log(customer);

    console.log("✅ Processing Engine Complete");
    console.log("=================================");
}
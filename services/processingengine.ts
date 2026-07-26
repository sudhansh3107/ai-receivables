import { getInvoiceFile, linkInvoiceToFile } from "./invoiceFileService";
import { extractInvoice } from "./server/invoiceExtractionService";
import { findOrCreateCustomer } from "./server/customerService";
import { createInvoice } from "./invoiceService";

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

    const result = await createInvoice(
    customer.id,
    invoiceFile.upload_session_id,
    extractedInvoice
    );

    const invoice = result.invoice;

    if (result.isDuplicate) {
    console.log("⚠️ Existing invoice reused");
    } else {
    console.log("🆕 New invoice created");
    }

    console.log(invoice);

    await linkInvoiceToFile(
    invoiceFile.id,
    invoice.id
    );

    console.log("🔗 Invoice linked to file");

    console.log("✅ Processing Engine Complete");
    console.log("=================================");
}
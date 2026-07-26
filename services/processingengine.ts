import { getInvoiceFile, linkInvoiceToFile } from "./invoiceFileService";
import { extractInvoice } from "./server/invoiceExtractionService";
import { findOrCreateCustomer } from "./server/customerService";
import { createInvoice } from "./invoiceService";
import { updateProcessingStatus } from "./invoiceFileService";
import { validateInvoice } from "./server/invoiceValidationService";

export async function processInvoice(invoiceFileId: string) {

    console.log("=================================");
    console.log("🚀 Starting Invoice Processing");

// Get Invoice File
    const invoiceFile =
        await getInvoiceFile(invoiceFileId);

    try {

// Extract Invoice
        const extractedInvoice =
            await extractInvoice(invoiceFile.storage_path);
        
// Validate Invoice            
        validateInvoice(extractedInvoice);
        console.log("✅ Invoice Validation Passed");

        console.log("📄 Extracted Invoice");
        console.log(extractedInvoice);

// Find Customer if not create one
        const customer =
            await findOrCreateCustomer(extractedInvoice);

        console.log("👤 Customer");
        console.log(customer);

// Create Invoice
        const result = await createInvoice(
            customer.id,
            invoiceFile.upload_session_id,
            extractedInvoice
        );

        const invoice = result.invoice;

// Check for duplicates
        if (result.isDuplicate) {
            console.log("⚠️ Existing invoice reused");
        } else {
            console.log("🆕 New invoice created");
        }

        console.log(invoice);
// Link Invoice file with Invoice
        await linkInvoiceToFile(
            invoiceFile.id,
            invoice.id
        );

        console.log("🔗 Invoice linked to file");

// change the Status to processing
        await updateProcessingStatus(
        invoiceFile.id,
        "processing"
    );
    
   // Update Processing Status to completed after process done
        await updateProcessingStatus(
            invoiceFile.id,
            "completed"
        );

        console.log("✅ Processing Engine Complete");
        console.log("=================================");

    } catch (error) {

        console.error("❌ Processing Failed");
        console.error(error);

        await updateProcessingStatus(
            invoiceFile.id,
            "failed",
            error instanceof Error
                ? error.message
                : "Unknown error"
        );

        throw error;
    }
}
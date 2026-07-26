import { getInvoiceFile, linkInvoiceToFile, updateProcessingStatus } from "./invoiceFileService";
import { extractInvoice } from "./server/invoiceExtractionService";
import { findOrCreateCustomer } from "./server/customerService";
import { createInvoice,findExistingInvoice } from "./invoiceService";
import { validateInvoice } from "./server/invoiceValidationService";
import { calculateInvoiceConfidence } from "./server/invoiceConfidenceService";
import { Invoice } from "@/app/types/invoice";

export async function processInvoice(invoiceFileId: string) {

    console.log("=================================");
    console.log("🚀 Starting Invoice Processing");

    // Get Invoice File
    const invoiceFile = await getInvoiceFile(invoiceFileId);

    // Update Processing Status
    await updateProcessingStatus(
        invoiceFile.id,
        "processing"
    );

    try {

        // Extract Invoice
        const extractedInvoice =
            await extractInvoice(invoiceFile.storage_path);

        console.log("📄 Extracted Invoice");
        console.log(extractedInvoice);

        // Validate Invoice
        validateInvoice(extractedInvoice);

        console.log("✅ Invoice Validation Passed");

        // Find Existing Customer or Create New One
        const {
            customer,
            isNew,
        } = await findOrCreateCustomer(extractedInvoice);

        console.log("👤 Customer");
        console.log(customer);
        console.log("🆕 Is New Customer:", isNew);

        
        const existingInvoice = await findExistingInvoice(
        customer.id,
        extractedInvoice.invoiceNumber
);

        const isDuplicate = existingInvoice !== null;

        const confidence = calculateInvoiceConfidence({
        extractedInvoice,
        customerExists: !isNew,
        isDuplicate,
        validationPassed: true,
        });

        console.log("🤖 Invoice Confidence");
        console.log(confidence);

        let invoice: Invoice;

        if (existingInvoice) {

            console.log("⚠️ Existing invoice reused");

            invoice = existingInvoice;

        } else {

            console.log("🆕 Creating new invoice");

            invoice = await createInvoice(
            customer.id,
            invoiceFile.upload_session_id,
            extractedInvoice,
            confidence
            );

}

        console.log("📄 Invoice");
        console.log(invoice);

        // Link Invoice File to Invoice
        await linkInvoiceToFile(
            invoiceFile.id,
            invoice.id
        );

        console.log("🔗 Invoice linked to file");

        // Update Processing Status
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
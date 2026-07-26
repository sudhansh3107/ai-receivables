export interface ExtractedInvoice {
    invoiceNumber: string;
    companyName: string;
    email?: string;
    gstNumber?: string;
    invoiceDate: string;
    dueDate: string;
    currency: string;
    invoiceAmount: number;
}

export async function extractInvoice(
    storagePath: string
): Promise<ExtractedInvoice> {

    console.log(`Extracting invoice from ${storagePath}`);

    return {
        invoiceNumber: "INV-1001",
        companyName: "ABC Industries Pvt Ltd",
        email: "accounts@abc.com",
        gstNumber: "36ABCDE1234F1Z5",
        invoiceDate: "2026-07-26",
        dueDate: "2026-08-25",
        currency: "INR",
        invoiceAmount: 15000,
    };
}
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
        invoiceNumber: "INV-1005",
        companyName: "XYZ Industries Pvt Ltd",
        email: "accounts@xyz.com",
        gstNumber: "36ABCDE1234G1Z6",
        invoiceDate: "2026-07-31",
        dueDate: "2026-08-25",
        currency: "INR",
        invoiceAmount: 150000,
    };
}
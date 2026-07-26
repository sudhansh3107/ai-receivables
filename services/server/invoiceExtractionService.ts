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

const companies = [
    "XYZ Industries Pvt Ltd",
    "ABC Manufacturing Pvt Ltd",
    "TechNova Solutions",
    "Prime Logistics",
    "Green Energy Systems",
    "Metro Electronics",
    "Elite Packaging",
    "Vision Technologies",
    "Silverline Traders",
    "Apex Industries",
];

function randomItem<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

function randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateGST(): string {
    const stateCode = randomBetween(10, 37);

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";

    const randomChar = () =>
        chars[Math.floor(Math.random() * chars.length)];

    const randomNumber = () =>
        numbers[Math.floor(Math.random() * numbers.length)];

    return (
        stateCode.toString().padStart(2, "0") +
        randomChar() +
        randomChar() +
        randomChar() +
        randomChar() +
        randomChar() +
        randomNumber() +
        randomNumber() +
        randomNumber() +
        randomNumber() +
        randomChar() +
        "1Z" +
        randomNumber()
    );
}

export async function extractInvoice(
    storagePath: string
): Promise<ExtractedInvoice> {
    console.log(`Extracting invoice from ${storagePath}`);

    const companyName = randomItem(companies);

    const today = new Date();

    const dueDate = new Date(today);
    dueDate.setDate(today.getDate() + randomItem([15, 30, 45, 60]));

    const companySlug = companyName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    return {
        invoiceNumber: `INV-${crypto
            .randomUUID()
            .slice(0, 8)
            .toUpperCase()}`,

        companyName,

        email: `accounts@${companySlug}.com`,

        gstNumber: generateGST(),

        invoiceDate: today.toISOString().split("T")[0],

        dueDate: dueDate.toISOString().split("T")[0],

        currency: "INR",

        invoiceAmount: randomBetween(5000, 250000),
    };
}
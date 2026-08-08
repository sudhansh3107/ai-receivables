import { supabase } from "@/lib/supabase";
import { logInvoiceActivity } from "./activityLogService";
import { ActivityTypes } from "@/lib/activityTypes";
import { InvoiceStatus, type InvoiceStatusType } from "@/lib/invoiceStatus";
import { type PaymentMethodType } from "@/lib/paymentMethods";
import { toLocalDateString } from "@/lib/date";
import {
    refreshCustomerInsights,
} from "./customerInsightService";


export interface RecordPaymentInput {
    invoiceId: string;
    customerId: string;

    amount: number;

    paymentDate: Date;

    paymentMethod: PaymentMethodType;

    paymentReference?: string;

    notes?: string;
}

async function getInvoice(invoiceId: string) {
    const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function getTotalPayments(invoiceId: string) {
    const { data, error } = await supabase
        .from("payments")
        .select("amount")
        .eq("invoice_id", invoiceId);

    if (error) {
        throw error;
    }

    return data.reduce(
        (total, payment) => total + Number(payment.amount),
        0
    );
}

function calculateInvoiceBalance(
    invoiceAmount: number,
    totalPaid: number
) {
    const balanceDue = Math.max(invoiceAmount - totalPaid, 0);

    const status: InvoiceStatusType =
        balanceDue === 0
            ? InvoiceStatus.PAID
            : balanceDue < invoiceAmount
            ? InvoiceStatus.PARTIAL
            : InvoiceStatus.PENDING;

    return {
        balanceDue,
        status,
    };
}

async function updateInvoice(
    invoiceId: string,
    balanceDue: number,
    status: InvoiceStatusType
) {
    const { data, error } = await supabase
        .from("invoices")
        .update({
            balance_due: balanceDue,
            status,
        })
        .eq("id", invoiceId)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function recordPayment(
    input: RecordPaymentInput
) {
    const { data: payment, error } = await supabase
        .from("payments")
        .insert({
            invoice_id: input.invoiceId,
            customer_id: input.customerId,

            amount: input.amount,

            payment_date: input.paymentDate.toISOString(),

            payment_method: input.paymentMethod,

            payment_reference: input.paymentReference,

            notes: input.notes,
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    const invoice = await getInvoice(input.invoiceId);

    const totalPaid = await getTotalPayments(
        input.invoiceId
    );

    const {
        balanceDue,
        status,
    } = calculateInvoiceBalance(
        Number(invoice.invoice_amount),
        totalPaid
    );

    await updateInvoice(
        input.invoiceId,
        balanceDue,
        status
    );

    const metadata = {
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        remainingBalance: balanceDue,
    };

    if (status === InvoiceStatus.PAID) {
    await logInvoiceActivity(
        input.invoiceId,
        input.customerId,
        ActivityTypes.INVOICE_PAID,
        `Invoice ${invoice.invoice_number} paid in full`,
        metadata
    );
} else {
    await logInvoiceActivity(
        input.invoiceId,
        input.customerId,
        ActivityTypes.PAYMENT_RECORDED,
        `Payment of ${input.amount} recorded`,
        metadata
    );
}

console.log("🧠 Refreshing Customer Insights...");

await refreshCustomerInsights(
    input.customerId
);

console.log("🧠 Customer Insights Updated");

return payment;
}

/* ---------------------------------------------------------- */
/* Dashboard Metrics Helpers */
/* ---------------------------------------------------------- */

function getMonthRange(monthOffset = 0) {
    const today = new Date();

    const start = new Date(
        today.getFullYear(),
        today.getMonth() + monthOffset,
        1
    );

    const end = new Date(
        today.getFullYear(),
        today.getMonth() + monthOffset + 1,
        1
    );

    return {
        start,
        end,
    };
}

export async function getRecoveredThisMonth(): Promise<number> {
    const today = new Date();

    const start = new Date(
        today.getFullYear(),
        today.getMonth(),
        1
    );

    const startDate = `${start.getFullYear()}-${String(
        start.getMonth() + 1
    ).padStart(2, "0")}-${String(
        start.getDate()
    ).padStart(2, "0")}`;

    const todayDate = `${today.getFullYear()}-${String(
        today.getMonth() + 1
    ).padStart(2, "0")}-${String(
        today.getDate()
    ).padStart(2, "0")}`;

    const { data, error } = await supabase
        .from("payments")
        .select("payment_date, amount")
        .gte("payment_date", startDate)
        .lte("payment_date", todayDate);

    if (error) throw error;

    console.table(data);

    const total = data.reduce(
        (sum, p) => sum + Number(p.amount),
        0
    );

    console.log("RecoveredThisMonth =", total);

    return total;
}

export async function getRecoveredLastMonth(): Promise<number> {
    const today = new Date();

    const startOfLastMonth = new Date(
        today.getFullYear(),
        today.getMonth() - 1,
        1
    );

    const sameDayLastMonth = new Date(
        today.getFullYear(),
        today.getMonth() - 1,
        today.getDate()
    );

    const startDate = toLocalDateString(
        startOfLastMonth
    );

    const endDate = toLocalDateString(
        sameDayLastMonth
    );

    const { data, error } = await supabase
        .from("payments")
        .select("amount")
        .gte("payment_date", startDate)
        .lte("payment_date", endDate);

    if (error) {
        throw error;
    }

    return data.reduce(
        (sum, payment) =>
            sum + Number(payment.amount),
        0
    );
}
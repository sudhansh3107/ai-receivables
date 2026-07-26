import { supabase } from "@/lib/supabase";
import { ExtractedInvoice } from "./invoiceExtractionService";

export async function findOrCreateCustomer(
    invoice: ExtractedInvoice
) {
    // Step 1 - GST Lookup
    if (invoice.gstNumber) {
        const customer = await findByGST(invoice.gstNumber);

        if (customer) {
            console.log("✅ Customer found by GST");

            return {
                customer,
                isNew: false,
            };
        }
    }

    // Step 2 - Email Lookup
    if (invoice.email) {
        const customer = await findByEmail(invoice.email);

        if (customer) {
            console.log("✅ Customer found by Email");

            return {
                customer,
                isNew: false,
            };
        }
    }

    // Step 3 - Create Customer
    console.log("🆕 Creating new customer");

    const customer = await createCustomer(invoice);

    return {
        customer,
        isNew: true,
    };
}

async function findByGST(gst: string) {
    const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("gst_number", gst)
        .maybeSingle();

    if (error) throw error;

    return data;
}

async function findByEmail(email: string) {
    const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("email", email)
        .maybeSingle();

    if (error) throw error;

    return data;
}

async function createCustomer(
    invoice: ExtractedInvoice
) {
    const { data, error } = await supabase
        .from("customers")
        .insert({
            company_name: invoice.companyName,
            email: invoice.email ?? null,
            gst_number: invoice.gstNumber ?? null,
            status: "active",
        })
        .select()
        .single();

    if (error) throw error;

    return data;
}
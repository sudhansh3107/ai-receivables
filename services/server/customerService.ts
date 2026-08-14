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

// Find-only lookup — never creates a customer. Reuses the same query
// as the private findByEmail() below; safe to call from flows (e.g.
// email-driven payment matching) that must never synthesize a new
// customer record from unverified inbound data.
export async function findCustomerByEmail(email: string) {
    return findByEmail(email);
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

// Responsibility #3 (Collections & Follow-Up) ONLY — every other caller
// (findOrCreateCustomer, findCustomerByEmail, findByEmail above) is
// untouched and keeps its existing throw-on-ambiguity behavior.
//
// customers.email has no UNIQUE constraint (only gst_number does), so
// .maybeSingle() can encounter more than one matching row. Supabase/
// PostgREST surfaces that as a thrown error (code PGRST116 — "JSON
// object requested, multiple (or no) rows returned"), not a silent
// pick of the first row. For collection-case email attribution this is
// exactly the case that must fail safe rather than guess: an ambiguous
// sender means "abstain" (§8/§13 of the approved Responsibility #3
// design — an email only ever affects an EXISTING case for a
// deterministically-resolved customer, never a guessed one).
//
// This function makes that abstain explicit and distinguishable in
// logs from a genuine database failure: ambiguity is logged as a
// warning and resolved to null (no case effect, no error thrown to the
// caller); any other error is rethrown as-is, preserving the exact
// same isolation/failure-handling behavior every other caller of this
// service already relies on.
export async function findCustomerByEmailSafe(
    email: string
): Promise<ReturnType<typeof findByEmail>> {
    const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("email", email)
        .maybeSingle();

    if (error) {
        const isAmbiguousMatch =
            error.code === "PGRST116" ||
            /multiple \(or no\) rows/i.test(error.message ?? "");

        if (isAmbiguousMatch) {
            console.warn(
                "Customer Attribution - Ambiguous email match (more than one customer shares this email), abstaining:",
                email
            );

            return null;
        }

        // A genuine database error — preserve existing throw-and-let-the-
        // caller's-isolation-boundary-handle-it behavior rather than
        // disguising it as "no customer found."
        throw error;
    }

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
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { openai } from "@/lib/openai";

export interface ExtractedInvoice {
  invoiceNumber: string;
  companyName: string;
  companyAddress: string | null;
  email: string | null;
  gstNumber: string | null;
  invoiceDate: string;
  dueDate: string;
  paymentTerms: string | null;
  currency: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  invoiceAmount: number;
}

export async function extractInvoice(
  storagePath: string
): Promise<ExtractedInvoice> {
  const { data, error } = await supabaseAdmin.storage
    .from("invoices")
    .createSignedUrl(storagePath, 300);

  if (error) {
    console.error("❌ Failed to create signed URL", error);
    throw error;
  }

  const response = await openai.responses.create({
    model: "gpt-5.5",

    reasoning: {
      effort: "none",
    },
    

    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "invoice_extraction",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            invoiceNumber: { type: "string" },
            companyName: { type: "string" },
            companyAddress: { type: ["string", "null"] },
            email: { type: ["string", "null"] },
            gstNumber: { type: ["string", "null"] },
            invoiceDate: { type: "string" },
            dueDate: { type: "string" },
            paymentTerms: { type: ["string", "null"] },
            currency: { type: "string" },
            subtotal: { type: "number" },
            cgst: { type: "number" },
            sgst: { type: "number" },
            invoiceAmount: { type: "number" },
          },
          required: [
            "invoiceNumber",
            "companyName",
            "companyAddress",
            "email",
            "gstNumber",
            "invoiceDate",
            "dueDate",
            "paymentTerms",
            "currency",
            "subtotal",
            "cgst",
            "sgst",
            "invoiceAmount",
          ],
        },
      },
    },

    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
Extract the invoice.

Rules:
- Return data matching the JSON schema.
- If a field is missing, return null.
- Do not infer missing values.
- Convert all dates to YYYY-MM-DD.
- Currency must be an ISO code (e.g. INR, USD).
- Monetary values must be numbers only.
`,
          },
          {
            type: "input_file",
            file_url: data.signedUrl,
          },
        ],
      },
    ],
  });

  console.log("Model:", response.model);

console.log("Usage:");
console.log(response.usage);

console.log("Output:");
console.log(response.output_text);

  if (!response.output_text) {
    throw new Error("OpenAI returned an empty response.");
  }

  return JSON.parse(response.output_text) as ExtractedInvoice;
}
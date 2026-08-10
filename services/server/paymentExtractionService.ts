import { openai } from "@/lib/openai";

export interface PaymentExtractionInput {
    subject: string | null;
    textBody: string | null;
}

export interface PaymentExtractionResult {
    amount: number | null;
    currency: string | null;
    paymentDate: string | null;
    invoiceNumber: string | null;
    paymentReference: string | null;
    confidence: number;
}

export async function extractPaymentDetails(
    input: PaymentExtractionInput
): Promise<PaymentExtractionResult> {
    const response = await openai.responses.create({
        model: "gpt-5.5",

        reasoning: {
            effort: "none",
        },

        text: {
            verbosity: "low",
            format: {
                type: "json_schema",
                name: "payment_extraction",
                strict: true,
                schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        amount: { type: ["number", "null"] },
                        currency: { type: ["string", "null"] },
                        paymentDate: { type: ["string", "null"] },
                        invoiceNumber: { type: ["string", "null"] },
                        paymentReference: { type: ["string", "null"] },
                        confidence: { type: "number" },
                    },
                    required: [
                        "amount",
                        "currency",
                        "paymentDate",
                        "invoiceNumber",
                        "paymentReference",
                        "confidence",
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
Extract payment details from this email.

Rules:
- Return data matching the JSON schema.
- Only extract a field if it is explicitly and confidently present in the
  email. If a field is missing, ambiguous, or merely implied, return null.
- Do not infer, guess, or invent any value from surrounding context.
- Do not calculate or derive values that are not explicitly stated.
- amount must be a plain number (no currency symbols, no thousands
  separators) when confidently present, otherwise null.
- currency must be a 3-letter ISO currency code (e.g. INR, USD) when
  confidently present, otherwise null.
- paymentDate must be in YYYY-MM-DD format when confidently present,
  otherwise null.
- invoiceNumber is an explicit invoice identifier/reference mentioned in
  the email, otherwise null.
- paymentReference is an explicit transaction/payment/UTR reference
  number mentioned in the email, otherwise null.
- confidence is a number from 0 to 1 reflecting how confident you are in
  the extracted facts overall (not a per-field score).

Subject:
${input.subject ?? "(no subject)"}

Body:
${input.textBody ?? "(no body)"}
`,
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

    return JSON.parse(
        response.output_text
    ) as PaymentExtractionResult;
}

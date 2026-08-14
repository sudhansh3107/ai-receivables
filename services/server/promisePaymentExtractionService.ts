import { openai } from "@/lib/openai";

// Responsibility #3 (Collections & Follow-Up) — extracts the facts a
// payment_promise-classified email actually states, nothing more. Same
// architecture as services/server/paymentExtractionService.ts (OpenAI
// structured output, strict JSON schema) — this is evidence for the
// deterministic decision engine (collectionDecisionEngine.ts), never a
// decision-maker itself: the LLM only classifies/extracts, the pure
// engine decides whether a promise is accepted (§ approved v2 rule:
// confidence >= 0.80, intent clear, a usable date — amount is optional
// and NEVER invented).
export interface PromiseExtractionInput {
    subject: string | null;
    textBody: string | null;
}

export interface PromiseExtractionResult {
    intentClear: boolean;
    amountStated: boolean;
    amount: number | null;
    currency: string | null;
    promiseDate: string | null;
    confidence: number;
}

export async function extractPromiseDetails(
    input: PromiseExtractionInput
): Promise<PromiseExtractionResult> {
    const response = await openai.responses.create({
        model: "gpt-5.5",

        reasoning: {
            effort: "none",
        },

        text: {
            verbosity: "low",
            format: {
                type: "json_schema",
                name: "promise_extraction",
                strict: true,
                schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        intentClear: { type: "boolean" },
                        amountStated: { type: "boolean" },
                        amount: { type: ["number", "null"] },
                        currency: { type: ["string", "null"] },
                        promiseDate: { type: ["string", "null"] },
                        confidence: { type: "number" },
                    },
                    required: [
                        "intentClear",
                        "amountStated",
                        "amount",
                        "currency",
                        "promiseDate",
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
Extract a payment commitment ("promise to pay") from this email, for an
Accounts Receivable inbox.

Rules:
- Return data matching the JSON schema.
- intentClear is true only if the customer is EXPLICITLY committing to
  pay by a specific date — not merely acknowledging the invoice exists,
  not merely saying they will "look into it", and not a vague statement
  with no committed date.
- promiseDate must be in YYYY-MM-DD format when a specific date is
  explicitly stated or unambiguously computable from the email's own
  content (e.g. "this Friday" relative to a date mentioned in the
  email). If no specific date can be confidently determined, return
  null — do not guess a date.
- amountStated must be true ONLY if a specific figure is explicitly
  written in the email. If true, amount must be a plain number (no
  currency symbols, no thousands separators) and currency a 3-letter
  ISO code (e.g. INR, USD) when confidently present, otherwise null.
- If no figure is stated, amountStated must be false and amount must be
  null. NEVER estimate, infer, or default amount to any outstanding
  balance or other figure not explicitly present in the email text.
- confidence is a number from 0 to 1 reflecting how confident you are
  that this email is a genuine, specific payment commitment.

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

    return JSON.parse(response.output_text) as PromiseExtractionResult;
}

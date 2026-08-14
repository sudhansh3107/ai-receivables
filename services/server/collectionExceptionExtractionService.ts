import { openai } from "@/lib/openai";
import type { ExceptionType } from "./collectionDecisionEngine";

// Responsibility #3 (Collections & Follow-Up) — extracts the specific
// dispute/blocker reason and a short human-readable detail from a
// dispute- or payment_blocker-classified email. One function,
// parameterized by category, sharing the structured-output scaffolding
// rather than duplicating it — dispute and blocker extraction share the
// same shape (a type from a fixed enum + a detail string), only the
// enum's allowed values differ.
//
// This is evidence only: it never decides whether to accept the
// dispute/blocker (that gate — classification confidence, dispute
// precedence — lives entirely in the deterministic
// collectionDecisionEngine.ts), and it never decides whether the
// dispute is valid or the blocker legitimate.
export type ExceptionExtractionCategory = "dispute" | "blocker";

export interface ExceptionExtractionInput {
    subject: string | null;
    textBody: string | null;
    category: ExceptionExtractionCategory;
}

const DISPUTE_TYPES = [
    "invoice_incorrect",
    "goods_not_received",
    "amount_disputed",
    "other",
] as const;

const BLOCKER_TYPES = [
    "po_issue",
    "approval_pending",
    "documentation_issue",
    "vendor_onboarding",
    "tax_compliance",
    "blocked_internally",
    "other",
] as const;

// exceptionType is typed against the full collectionDecisionEngine.ts
// ExceptionType union (a superset of DISPUTE_TYPES/BLOCKER_TYPES below,
// which are the JSON schema's actual per-call enum constraints) so this
// result plugs directly into ExceptionExtractionEvidence without a cast.
export interface ExceptionExtractionResult {
    exceptionType: ExceptionType;
    detail: string;
    confidence: number;
}

export async function extractExceptionDetails(
    input: ExceptionExtractionInput
): Promise<ExceptionExtractionResult> {
    const allowedTypes =
        input.category === "dispute" ? DISPUTE_TYPES : BLOCKER_TYPES;

    const categoryDescription =
        input.category === "dispute"
            ? "the customer is disputing the debt itself (contesting the invoice's accuracy, amount, or whether goods/services were received)"
            : "the customer intends to pay but is internally stuck (an administrative/process blocker, not a contest of the debt)";

    const response = await openai.responses.create({
        model: "gpt-5.5",

        reasoning: {
            effort: "none",
        },

        text: {
            verbosity: "low",
            format: {
                type: "json_schema",
                name: "exception_extraction",
                strict: true,
                schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        exceptionType: {
                            type: "string",
                            enum: [...allowedTypes],
                        },
                        detail: { type: "string" },
                        confidence: { type: "number" },
                    },
                    required: ["exceptionType", "detail", "confidence"],
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
This email has already been classified as a case where ${categoryDescription}.

Extract:
- exceptionType: the single best-matching category from the allowed
  values in the schema. Use "other" if none of the more specific
  values fit.
- detail: a short (1-2 sentence), factual summary of what the customer
  actually said, in your own words. Do not add information not present
  in the email. Do not judge whether the dispute/blocker is legitimate.
- confidence: a number from 0 to 1 reflecting how confident you are in
  the exceptionType classification.

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

    return JSON.parse(response.output_text) as ExceptionExtractionResult;
}

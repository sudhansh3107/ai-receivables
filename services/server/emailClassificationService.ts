import { openai } from "@/lib/openai";
import {
    EmailClassification,
    EMAIL_CLASSIFICATION_VALUES,
} from "@/lib/emailClassification";

export interface EmailClassificationInput {
    subject: string | null;
    textBody: string | null;
}

export interface EmailClassificationResult {
    classification: EmailClassification;
    confidence: number;
}

export async function classifyEmail(
    input: EmailClassificationInput
): Promise<EmailClassificationResult> {
    const response = await openai.responses.create({
        model: "gpt-5.5",

        reasoning: {
            effort: "none",
        },

        text: {
            verbosity: "low",
            format: {
                type: "json_schema",
                name: "email_classification",
                strict: true,
                schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        classification: {
                            type: "string",
                            enum: EMAIL_CLASSIFICATION_VALUES,
                        },
                        confidence: {
                            type: "number",
                            minimum: 0,
                            maximum: 1,
                        },
                    },
                    required: ["classification", "confidence"],
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
Classify this email for an Accounts Receivable inbox.

Rules:
- Return data matching the JSON schema.
- classification must be exactly one of the allowed enum values.
- confidence must be a number between 0 and 1 reflecting how certain
  you are in the classification.
- Base the classification only on the subject and body provided.
- dispute vs payment_blocker: use "dispute" only when the customer is
  contesting the debt itself (the invoice is wrong, amount is disputed,
  goods/services were not received). Use "payment_blocker" when the
  customer is NOT contesting the debt but is internally stuck on
  paying it (waiting on a PO, internal approval, documentation, vendor
  onboarding, or a tax/compliance step). If genuinely unclear which of
  the two applies, prefer "dispute" (the more conservative category).

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
    ) as EmailClassificationResult;
}

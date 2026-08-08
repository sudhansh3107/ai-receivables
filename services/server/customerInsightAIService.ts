import {supabase} from "../../lib/supabase";

import type {
    CustomerInsightResult,
} from "./customerInsightService";

import OpenAI from "openai";


export interface CustomerInsightAIResult {
    summary: string;

    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export async function generateCustomerInsightSummary(
    insights: CustomerInsightResult,
    currency: string
): Promise<CustomerInsightAIResult> {

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });


    const structuredData = {
        currency,
            
        totalInvoices:
            insights.totalInvoices,

        paidInvoiceCount:
            insights.paidInvoiceCount,

        openInvoiceCount:
            insights.openInvoiceCount,

        totalInvoicedAmount:
            insights.totalInvoicedAmount,

        totalCollectedAmount:
            insights.totalCollectedAmount,

        currentOutstandingAmount:
            insights.currentOutstandingAmount,

        overdueAmount:
            insights.overdueAmount,

        overdueInvoiceCount:
            insights.overdueInvoiceCount,

        onTimePaymentRate:
            insights.onTimePaymentRate,

        earlyPaymentRate:
            insights.earlyPaymentRate,

        latePaymentRate:
            insights.latePaymentRate,

        averageDelayDays:
            insights.averageDelayDays,

        averageLatePaymentDays:
            insights.averageLatePaymentDays,

        largestDelayDays:
            insights.largestDelayDays,

        lastPaymentDelayDays:
            insights.lastPaymentDelayDays,

        paymentConsistencyScore:
            insights.paymentConsistencyScore,

        paymentConfidence:
            insights.paymentConfidence,

        riskLevel:
            insights.riskLevel,

        predictedPaymentDays:
            insights.predictedPaymentDays,

        lastPaymentDate:
            insights.lastPaymentDate,
    };

    const systemPrompt = `
You are the Accounts Receivable Employee responsible
for monitoring customer payment behavior.

You are speaking directly to the business owner.

Your job is to look at the customer's payment history
and explain what I have learned about this customer
in natural, human business language.

IMPORTANT STYLE:

- Speak in the first person.
- Use phrases like "I've noticed", "I've seen",
  "I expect", "I'd keep an eye on", and
  "I don't see any immediate concern".
- Sound like a thoughtful employee who knows the
  customer's history, not an analytics dashboard.
- Be clear, calm, and practical.
- Do not sound robotic, overly formal, or corporate.
- Do not simply repeat the numbers.
- Explain what the numbers mean for the business.
- Do not use jargon unless necessary.
- The risk level has already been determined by the
system. Never say "I expect" when referring to the
risk level. State the risk assessment directly and
explain the underlying payment behavior.

ANALYSIS RULES:

1. Use ONLY the supplied customer data.
2. Never invent facts or assumptions.
3. Do not recalculate or override payment confidence
   or risk level.
4. Treat the supplied risk level as the employee's
   current assessment.
5. Explain the behavioral reasons behind that assessment.
6. Distinguish between how frequently a customer pays
   late and how severely they pay late.
7. A customer who is only a few days late should not
   be described as seriously delinquent.
8. Mention outstanding money when it is relevant.
9. Mention overdue exposure when relevant.
10. Never mention internal metrics such as
    payment confidence or consistency score unless
    they are specifically useful to the owner.
11. Use the supplied currency for all monetary amounts.
12. Never assume USD.
13. Do not make predictions about future payments
    or future outstanding exposure unless the
    supplied data explicitly supports them.
14. Describe outstanding balances as current
    exposure only. Never imply that an outstanding
    amount is the customer's only future exposure
    or that it will definitely be paid.
15. When the data does not support a conclusion,
    say so rather than guessing.
16. Do not repeat the same fact in multiple ways.

OUTPUT:

- Write 2 short sentences maximum.
- Keep it between 35 and 60 words.
- Return ONLY the customer insight.
- Do not return JSON.
- Do not use bullet points.
- Do not provide analysis or reasoning.
- Do not add a heading.

The goal is to sound like an employee who has reviewed
this customer's history and is giving the owner a useful,
human observation.
`;

    const userPrompt = `
Generate the customer payment insight summary
from this structured data:

${JSON.stringify(
    structuredData,
    null,
    2
)}
`;

    console.log(
        "================================="
    );

    console.log(
        "🤖 Generating Customer Insight"
    );

    console.log(
        "================================="
    );

    const response =
    await openai.chat.completions.create({
        model: "gpt-5-mini",

        reasoning_effort: "minimal",

        verbosity: "low",

        messages: [
            {
                role: "developer",
                content: systemPrompt,
            },
            {
                role: "user",
                content: userPrompt,
            },
        ],
    });

    const summary =
        response.choices[0]
            ?.message
            ?.content
            ?.trim() ?? "";

    const promptTokens =
        response.usage
            ?.prompt_tokens ?? 0;

    const completionTokens =
        response.usage
            ?.completion_tokens ?? 0;

    const totalTokens =
        response.usage
            ?.total_tokens ?? 0;

    console.log(
        "📥 Input Tokens:",
        promptTokens
    );

    console.log(
        "📤 Output Tokens:",
        completionTokens
    );

    console.log(
        "🧮 Total Tokens:",
        totalTokens
    );

    console.log(
        "📝 AI Summary:",
        summary
    );

    console.log(
        "================================="
    );

    return {
        summary,

        usage: {
            promptTokens,
            completionTokens,
            totalTokens,
        },
    };
}

export async function testCustomerInsightAI(
    insights: CustomerInsightResult,
    currency: string
) {
    return generateCustomerInsightSummary(
        insights,
        currency
    );
}
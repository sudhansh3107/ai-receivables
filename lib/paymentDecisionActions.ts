// Thin client-side wrapper around the EXISTING approve endpoint
// (POST /api/payment-decisions/[id]/approve, itself unmodified) —
// shared by DecisionFeed (Mission Control) and PaymentDecisionFeed
// (/decisions) so there is exactly one implementation of "how do we
// call approve" instead of two copies of the same fetch/error
// handling. Never calls the execute endpoint — this only ever
// performs the existing pending -> approved transition.
export async function approvePaymentDecisionRequest(
    decisionId: string
): Promise<void> {
    const response = await fetch(
        `/api/payment-decisions/${decisionId}/approve`,
        { method: "POST" }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error(
            result.error ?? "Failed to approve payment decision."
        );
    }
}

// Thin client-side wrapper around POST /api/payment-decisions/[id]/
// request-proof. Mirrors approvePaymentDecisionRequest()'s shape and
// contract exactly: makes the request, parses the response, throws a
// plain Error with a useful message on failure. It does NOT touch Gmail,
// does NOT construct the email, does NOT resolve the recipient, and never
// calls approve/execute — all of that is server-side only, inside
// services/server/paymentProofRequestService.ts. The browser supplies
// nothing but decisionId.
export async function requestPaymentProofRequest(
    decisionId: string
): Promise<void> {
    const response = await fetch(
        `/api/payment-decisions/${decisionId}/request-proof`,
        { method: "POST" }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error(
            result.message ??
                result.error ??
                "Failed to send proof request."
        );
    }
}

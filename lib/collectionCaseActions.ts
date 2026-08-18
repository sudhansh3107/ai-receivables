// Thin client-side wrappers around the collection-case human-action
// endpoints, mirroring lib/paymentDecisionActions.ts's shape and
// contract exactly: make the request, parse the response, throw a
// plain Error with a useful message on failure. The browser supplies
// nothing but the case id — every fact used server-side (customer,
// evidence, destination status) is resolved from the database.

export async function resumeCollectionCaseRequest(
    caseId: string
): Promise<void> {
    const response = await fetch(
        `/api/collection-cases/${caseId}/resume`,
        { method: "POST" }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error(
            result.message ?? result.error ?? "Failed to resume collection case."
        );
    }
}

export async function resolveCollectionCaseRequest(
    caseId: string
): Promise<void> {
    const response = await fetch(
        `/api/collection-cases/${caseId}/resolve`,
        { method: "POST" }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error(
            result.message ?? result.error ?? "Failed to resolve collection case."
        );
    }
}

// "Keep monitoring" — not an approval, only hides the case from the
// queue for 24 hours (services/server/collectionCaseService.ts::
// deferCollectionCaseEscalation()).
export async function deferCollectionCaseRequest(
    caseId: string
): Promise<void> {
    const response = await fetch(
        `/api/collection-cases/${caseId}/wait`,
        { method: "POST" }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error(
            result.message ?? result.error ?? "Failed to defer collection case."
        );
    }
}

// Responsibility #9 — a human answering the employee's escalation
// prompt with free-form context/instruction. Resumes the case as part
// of the same action (services/server/collectionCaseService.ts::
// provideCollectionCaseGuidance()); distinct from resumeCollectionCaseRequest()
// above, which carries no context.
export async function provideCollectionCaseGuidanceRequest(
    caseId: string,
    guidance: string
): Promise<void> {
    const response = await fetch(
        `/api/collection-cases/${caseId}/provide-guidance`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guidance }),
        }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error(
            result.message ?? result.error ?? "Failed to record guidance for this case."
        );
    }
}

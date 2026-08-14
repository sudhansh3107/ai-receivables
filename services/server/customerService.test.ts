import { describe, expect, it, vi, beforeEach } from "vitest";

// A minimal chainable mock of the Supabase query builder: every method
// returns `this`, and the object itself is thenable, resolving to
// whatever `queueResponse()` was told to hand back for this call. This
// is enough to exercise findCustomerByEmailSafe()'s error-branching
// logic without a real database.
function createSupabaseMock() {
    let nextResponse: { data: unknown; error: unknown } = {
        data: null,
        error: null,
    };

    const builder: Record<string, unknown> = {};

    const chainMethod = () => builder;

    Object.assign(builder, {
        from: chainMethod,
        select: chainMethod,
        eq: chainMethod,
        maybeSingle: chainMethod,
        then: (
            resolve: (value: { data: unknown; error: unknown }) => void
        ) => {
            resolve(nextResponse);
        },
    });

    return {
        client: { from: () => builder } as unknown,
        queueResponse(response: { data: unknown; error: unknown }) {
            nextResponse = response;
        },
    };
}

const supabaseMock = createSupabaseMock();

vi.mock("@/lib/supabase", () => ({
    get supabase() {
        return supabaseMock.client;
    },
}));

describe("findCustomerByEmailSafe", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("returns the customer on a clean single match", async () => {
        const { findCustomerByEmailSafe } = await import("./customerService");

        supabaseMock.queueResponse({
            data: { id: "cust-1", email: "ap@acme.com" },
            error: null,
        });

        const result = await findCustomerByEmailSafe("ap@acme.com");

        expect(result).toEqual({ id: "cust-1", email: "ap@acme.com" });
    });

    it("abstains (returns null) on an ambiguous multi-row match (PGRST116) and logs it distinctly", async () => {
        const { findCustomerByEmailSafe } = await import("./customerService");

        const warnSpy = vi
            .spyOn(console, "warn")
            .mockImplementation(() => {});

        supabaseMock.queueResponse({
            data: null,
            error: {
                code: "PGRST116",
                message:
                    "JSON object requested, multiple (or no) rows returned",
            },
        });

        const result = await findCustomerByEmailSafe("shared@acme.com");

        expect(result).toBeNull();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0].join(" ")).toMatch(/ambiguous/i);
    });

    it("rethrows a genuine database error rather than disguising it as 'no customer'", async () => {
        const { findCustomerByEmailSafe } = await import("./customerService");

        supabaseMock.queueResponse({
            data: null,
            error: { code: "500", message: "connection reset" },
        });

        await expect(
            findCustomerByEmailSafe("ap@acme.com")
        ).rejects.toMatchObject({ code: "500" });
    });

    it("returns null (no error) when zero rows match", async () => {
        const { findCustomerByEmailSafe } = await import("./customerService");

        supabaseMock.queueResponse({ data: null, error: null });

        const result = await findCustomerByEmailSafe("unknown@nobody.com");

        expect(result).toBeNull();
    });
});

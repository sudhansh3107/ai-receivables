import { NextResponse } from "next/server";
import {
    getUnclassifiedEmails,
    updateEmailClassification,
    markEmailClassificationFailed,
} from "@/services/server/emailService";
import { classifyEmail } from "@/services/server/emailClassificationService";
import { matchPaymentEmail } from "@/services/server/paymentEmailMatchingService";
import { persistPaymentDecision } from "@/services/server/paymentDecisionService";

const BATCH_SIZE = 10;

export async function POST() {
    try {
        const emails = await getUnclassifiedEmails(BATCH_SIZE);

        const classifiedIds: string[] = [];

        const failures: {
            emailId: string;
            error: string;
        }[] = [];

        for (const email of emails) {
            try {
                const result = await classifyEmail({
                    subject: email.subject,
                    textBody: email.text_body,
                });

                await updateEmailClassification(
                    email.id,
                    result.classification,
                    result.confidence
                );

                classifiedIds.push(email.id);

                // Payment-decision side effect is isolated from
                // classification itself: classification has already
                // succeeded and been persisted above, so a failure
                // here must never roll it back or mark the email
                // failed. This never executes a payment — it only
                // ever produces a durable, unapproved proposal via
                // persistPaymentDecision().
                if (result.classification === "payment_received") {
                    try {
                        const matchResult = await matchPaymentEmail({
                            subject: email.subject,
                            textBody: email.text_body,
                            fromEmail: email.from_email,
                            receivedAt: email.received_at,
                        });

                        await persistPaymentDecision(
                            email.id,
                            matchResult
                        );
                    } catch (paymentError) {
                        console.error(
                            "Payment Decision - Failed for email:",
                            email.id,
                            paymentError
                        );
                    }
                }
            } catch (error) {
                console.error(
                    "Email Classification - Message Failed:",
                    email.id,
                    error
                );

                await markEmailClassificationFailed(email.id);

                failures.push({
                    emailId: email.id,
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                });
            }
        }

        return NextResponse.json({
            success: failures.length === 0,
            attempted: emails.length,
            classified: classifiedIds.length,
            failed: failures.length,
            classifiedEmailIds: classifiedIds,
            failures,
        });
    } catch (error) {
        console.error("Email Classification Error:", error);

        return NextResponse.json(
            {
                error: "Failed to classify emails",
            },
            { status: 500 }
        );
    }
}

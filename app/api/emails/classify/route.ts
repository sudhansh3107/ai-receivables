import { NextResponse } from "next/server";
import {
    getUnclassifiedEmails,
    updateEmailClassification,
    markEmailClassificationFailed,
} from "@/services/server/emailService";
import { classifyEmail } from "@/services/server/emailClassificationService";

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

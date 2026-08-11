import { ActivityType, ActivityTypes } from "@/lib/activityTypes";

export type EmployeeActivityIcon =
    | "payment"
    | "mail"
    | "phone"
    | "calendar"
    | "document"
    | "warning"
    | "handshake";

export type EmployeeActivityStatus =
    | "Completed"
    | "Pending"
    | "Waiting";

export interface EmployeeActivity {
    id: string;

    time: string;

    icon: EmployeeActivityIcon;

    title: string;

    subtitle: string;

    status: EmployeeActivityStatus;
}

function formatTime(date: string) {
    return new Date(date).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function mapActivityLog(
    activity: any
): EmployeeActivity {

   switch (activity.activity_type as ActivityType) {

    case ActivityTypes.PAYMENT_CLAIM_RECEIVED:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "mail",

            title: "Payment claim received",

            subtitle: activity.description,

            status: "Completed",
        };

    case ActivityTypes.PAYMENT_PROOF_REQUESTED:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "mail",

            title: `Requested payment confirmation from ${
                activity.customers?.company_name ?? "Customer"
            }`,

            subtitle: activity.description,

            status: "Completed",
        };

    case ActivityTypes.PAYMENT_DECISION_RESOLVED:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "payment",

            title: "Payment decision resolved",

            subtitle: activity.description,

            status: "Completed",
        };

    case ActivityTypes.PAYMENT_DECISION_DEFERRED:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "payment",

            title: "Payment decision deferred",

            subtitle: activity.description,

            status: "Waiting",
        };

    case ActivityTypes.PAYMENT_DECISION_WAIT_COMPLETED:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "payment",

            title: "Payment confirmation still pending",

            subtitle: activity.description,

            status: "Waiting",
        };

    case ActivityTypes.PAYMENT_CLAIM_MATCHED:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "payment",

            title: `Payment claim matched for ${
                activity.customers?.company_name ?? "Customer"
            }`,

            subtitle: activity.description,

            status: "Completed",
        };

    case ActivityTypes.PAYMENT_RECORDED:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "payment",

            title: `Payment received from ${
                activity.customers?.company_name ?? "Customer"
            }`,

            subtitle: `₹${Number(
                activity.metadata?.amount ?? 0
            ).toLocaleString("en-IN")} received`,

            status: "Completed",
        };

    case ActivityTypes.INVOICE_PAID:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "payment",

            title: `Invoice settled for ${
                activity.customers?.company_name ?? "Customer"
            }`,

            subtitle: `Invoice ${
                activity.invoices?.invoice_number ?? ""
            } paid in full`,

            status: "Completed",
        };

    case ActivityTypes.INVOICE_PARTIALLY_PAID:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "payment",

            title: `Partial payment from ${
                activity.customers?.company_name ?? "Customer"
            }`,

            subtitle: activity.metadata?.amount
                ? `₹${Number(
                      activity.metadata.amount
                  ).toLocaleString("en-IN")} received`
                : activity.description,

            status: "Completed",
        };

    case ActivityTypes.REMINDER_SENT:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "mail",

            title: `Reminder sent to ${
                activity.customers?.company_name ?? "Customer"
            }`,

            subtitle: `Stage ${
                activity.metadata?.stage ?? ""
            } reminder emailed`,

            status: "Completed",
        };

    case ActivityTypes.REMINDER_SCHEDULED:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "calendar",

            title: `Reminder scheduled for ${
                activity.customers?.company_name ?? "Customer"
            }`,

            subtitle: activity.description,

            status: "Completed",
        };

    case ActivityTypes.INVOICE_CREATED:
    case ActivityTypes.INVOICE_UPLOADED:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "document",

            title: `Invoice processed for ${
                activity.customers?.company_name ?? "Customer"
            }`,

            subtitle: `Invoice ${
                activity.invoices?.invoice_number ?? ""
            } extracted successfully`,

            status: "Completed",
        };

    case ActivityTypes.INVOICE_VALIDATED:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "document",

            title: `Invoice validated for ${
                activity.customers?.company_name ?? "Customer"
            }`,

            subtitle: activity.description,

            status: "Completed",
        };

    case ActivityTypes.INVOICE_CONFIDENCE_CALCULATED:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "warning",

            title: `Confidence analysed for ${
                activity.customers?.company_name ?? "Customer"
            }`,

            subtitle: activity.description,

            status: "Completed",
        };

    case ActivityTypes.CUSTOMER_CREATED:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "document",

            title: `Added ${
                activity.customers?.company_name ?? "Customer"
            }`,

            subtitle: "Customer profile created",

            status: "Completed",
        };

    case ActivityTypes.CUSTOMER_MATCHED:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "document",

            title: `Matched ${
                activity.customers?.company_name ?? "Customer"
            }`,

            subtitle: "Existing customer identified",

            status: "Completed",
        };

    case ActivityTypes.INVOICE_OVERDUE:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "warning",

            title: `Invoice overdue for ${
                activity.customers?.company_name ?? "Customer"
            }`,

            subtitle: `Invoice ${
                activity.invoices?.invoice_number ?? ""
            } is overdue`,

            status: "Waiting",
        };

        case ActivityTypes.CUSTOMER_INSIGHTS_UPDATED:

    return {
        id: activity.id,
        time: formatTime(activity.created_at),

        icon: "warning",

        title: `Behavior reassessed for ${
    activity.customers?.company_name ?? "Customer"
}`,

        subtitle:
    `${
        activity.metadata?.riskLevel === "limited_history"
            ? "Limited history"
            : activity.metadata?.riskLevel === "high"
            ? "High risk"
            : activity.metadata?.riskLevel === "medium"
            ? "Medium risk"
            : activity.metadata?.riskLevel === "low"
            ? "Low risk"
            : "Unknown"
    } · ` +
    `${activity.metadata?.paymentConfidence ?? 0}% confidence · ` +
    `₹${Number(
        activity.metadata?.currentOutstandingAmount ?? 0
    ).toLocaleString("en-IN")} outstanding`,
        status: "Completed",
    };

    default:

        return {
            id: activity.id,
            time: formatTime(activity.created_at),

            icon: "document",

            title: "Activity recorded",

            subtitle: activity.description,

            status: "Completed",
        };
}
}
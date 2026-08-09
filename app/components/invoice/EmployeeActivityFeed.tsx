"use client";

import { useEffect, useState } from "react";
import {
    Brain,
    CheckCircle2,
    Database,
    FileText,
} from "lucide-react";

import {
    getEmployeeActivity,
    subscribeToEmployeeActivity,
} from "@/services/EmployeeActivityService";
import { tokens } from "@/lib/theme/tokens";

type EmployeeActivity = {
    id: string;
    activity_type: string;
    message: string;
    created_at: string;
};

type EmployeeActivityFeedProps = {
    uploadSessionId: string;
};

export default function EmployeeActivityFeed({
    uploadSessionId,
}: EmployeeActivityFeedProps) {
    const [activities, setActivities] = useState<
        EmployeeActivity[]
    >([]);

  useEffect(() => {
    if (!uploadSessionId) return;

    void loadActivity();

    const channel = subscribeToEmployeeActivity(
        uploadSessionId,
        () => {
            void loadActivity();
        }
    );

    return () => {
        channel.unsubscribe();
    };
}, [uploadSessionId]);

    async function loadActivity() {
    try {
        const data = await getEmployeeActivity(
            uploadSessionId,
            3
        );

        setActivities(data ?? []);
    } catch (err) {
        console.error("Employee Activity:", err);
    }
}

    function getIcon(type: string) {
        switch (type) {
            case "assignment_started":
                return (
                    <FileText
                        size={18}
                        color={tokens.brand.primary}
                    />
                );

            case "reading_invoice":
                return (
                    <Brain
                        size={18}
                        color={tokens.brand.primary}
                    />
                );

            case "invoice_processed":
                return (
                    <CheckCircle2
                        size={18}
                        color={tokens.semantic.success}
                    />
                );

            default:
                return (
                    <Database
                        size={18}
                        color={tokens.brand.primary}
                    />
                );
        }
    }

    return (
        <div
            className="mt-6 p-6"
            style={{
                borderRadius: tokens.radius.container,
                border: `1px solid ${tokens.semantic.border}`,
                background: tokens.semantic.surface,
            }}
        >

            <h3
                className="text-[14px] font-semibold tracking-[-0.01em]"
                style={{
                    color: tokens.semantic.textPrimary,
                }}
            >
                Live Activity
            </h3>

            <div
                className="mt-5 space-y-4"
                aria-live="polite"
            >

                {activities.map((activity) => (

                    <div
                        key={activity.id}
                        className="flex gap-4"
                    >

                        <div
                            className="mt-[2px] flex h-9 w-9 items-center justify-center rounded-full"
                            style={{
                                background: tokens.semantic.surfaceWarm,
                            }}
                        >

                            {getIcon(
                                activity.activity_type
                            )}

                        </div>

                        <div className="flex-1">

                            <p
                                className="text-[14px] font-medium"
                                style={{
                                    color: tokens.semantic.textPrimary,
                                }}
                            >
                                {activity.message}
                            </p>

                            <p
                                className="mt-1 text-[12px]"
                                style={{
                                    color: tokens.semantic.textMuted,
                                }}
                            >
                                {new Date(
                                    activity.created_at
                                ).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </p>

                        </div>

                    </div>

                ))}

            </div>

        </div>
    );
}
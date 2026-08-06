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
                        className="text-[#A47A45]"
                    />
                );

            case "reading_invoice":
                return (
                    <Brain
                        size={18}
                        className="text-[#A47A45]"
                    />
                );

            case "invoice_processed":
                return (
                    <CheckCircle2
                        size={18}
                        className="text-[#5F8F58]"
                    />
                );

            default:
                return (
                    <Database
                        size={18}
                        className="text-[#A47A45]"
                    />
                );
        }
    }

    return (
        <div className="mt-6 rounded-2xl border border-[#ECE5DD] bg-white p-6">

            <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-[#23201D]">
                Live Activity
            </h3>

            <div className="mt-5 space-y-4">

                {activities.map((activity) => (

                    <div
                        key={activity.id}
                        className="flex gap-4"
                    >

                        <div className="mt-[2px] flex h-9 w-9 items-center justify-center rounded-full bg-[#F8F4EE]">

                            {getIcon(
                                activity.activity_type
                            )}

                        </div>

                        <div className="flex-1">

                            <p className="text-[14px] font-medium text-[#23201D]">
                                {activity.message}
                            </p>

                            <p className="mt-1 text-[12px] text-[#8A857F]">
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
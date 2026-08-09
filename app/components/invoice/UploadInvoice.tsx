"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";
import { motion } from "motion/react";
import {
    ArrowRight,
    Check,
    FileText,
    FileUp,
} from "lucide-react";

import { createUploadSession,updateProcessedFiles,completeUploadSession } from "@/services/UploadSessionService";
import ModalHeader from "@/app/components/shared/ModalHeader";
import { uploadInvoice } from "@/services/storageService";
import { createInvoiceFile } from "@/services/invoiceFileService";
import {
    getUploadSessionConfidenceBreakdown,
    type UploadSessionConfidenceBreakdown,
} from "@/services/invoiceService";
import { useUploadSession } from "@/app/hooks/useUploadSession";
import { processInvoiceAction } from "@/app/actions/processInvoiceAction";
import { useRouter } from "next/navigation";

import { logEmployeeActivity } from "@/services/EmployeeActivityService";
import EmployeeActivityFeed from "./EmployeeActivityFeed";
import Button from "@/app/components/ui/Button";
import { tokens } from "@/lib/theme/tokens";


// import { extractInvoice } from "@/services/aiService";

type UploadInvoiceProps = {
    stepLabel?: string;
    onBack: () => void;
    onClose: () => void;
    onReviewResults?: () => void;
};

export default function UploadInvoice({
    stepLabel,
    onBack,
    onClose,
    onReviewResults,
}: UploadInvoiceProps) {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadSessionId, setUploadSessionId] = useState<string | null>(null);
    const [successShown, setSuccessShown] = useState(false);
    const session = useUploadSession(uploadSessionId);
    const [completed, setCompleted] =
    useState(false);
    const [confidenceBreakdown, setConfidenceBreakdown] =
        useState<UploadSessionConfidenceBreakdown | null>(null);
    const router = useRouter();
    const handleClose = () => {
    router.refresh();
    onClose();
};
   useEffect(() => {
    if (
        session &&
        !successShown &&
        session.processed_files === session.total_files &&
        session.processing_status === "uploaded"
    ) {
        setSuccessShown(true);
        setCompleted(true);
    }
}, [session, successShown]);

    useEffect(() => {
        if (!completed || !uploadSessionId) return;

        getUploadSessionConfidenceBreakdown(uploadSessionId)
            .then(setConfidenceBreakdown)
            .catch((error) => {
                console.error(error);
            });
    }, [completed, uploadSessionId]);


    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        setSelectedFiles((prev) => [...prev, ...acceptedFiles]);
    }, []);

    const removeFile = (index: number) => {
        setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        multiple: true,

        accept: {
            "application/pdf": [".pdf"],
        },

        maxSize: 10 * 1024 * 1024,
    });

    const handleUpload = async () => {
        if (selectedFiles.length === 0) return;

        try {
            setUploading(true);
            setSuccessShown(false);

    const uploadSession = await createUploadSession(selectedFiles.length);
    setUploadSessionId(uploadSession.id);

    await logEmployeeActivity({
    uploadSessionId: uploadSession.id,
    activityType: "assignment_started",
    message: `Received ${selectedFiles.length} invoice(s).`,
});



let processed = 0;

for (const file of selectedFiles) {

    await logEmployeeActivity({
    uploadSessionId: uploadSession.id,
    activityType: "reading_invoice",
    message: `Reading ${file.name}`,
});

    const uploadResult = await uploadInvoice(file);

    const invoiceFile = await createInvoiceFile({
    uploadSessionId: uploadSession.id,
    fileName: file.name,
    storagePath: uploadResult.path,
    mimeType: file.type,
    fileSizeBytes: file.size,
});

await processInvoiceAction(invoiceFile.id);
await logEmployeeActivity({
    uploadSessionId: uploadSession.id,
    invoiceFileId: invoiceFile.id,
    activityType: "invoice_processed",
    message: `${file.name} processed successfully.`,
});
    processed++;

    await updateProcessedFiles(
        uploadSession.id,
        processed
    );
}

        await completeUploadSession(uploadSession.id);

        await logEmployeeActivity({
    uploadSessionId: uploadSession.id,
    activityType: "assignment_completed",
    message: "Assignment completed successfully.",
});

            setSelectedFiles([]);
        } catch (error) {
            console.error(error);
            toast.error("One or more uploads failed.");
        } finally {
            setUploading(false);
        }
    };

if (completed) {
    const summaryChips: {
        label: string;
        value: number | string;
        status: { background: string; text: string };
    }[] = [
        {
            label: "High Confidence",
            value: confidenceBreakdown
                ? confidenceBreakdown.highConfidence
                : "—",
            status: tokens.status.completed,
        },
        {
            label: "Review Recommended",
            value: confidenceBreakdown
                ? confidenceBreakdown.reviewRecommended
                : "—",
            status: tokens.status.pending,
        },
        {
            label: "Needs Review",
            value: confidenceBreakdown
                ? confidenceBreakdown.needsReview
                : "—",
            status: tokens.status.overdue,
        },
    ];

    return (
        <>
            <ModalHeader
                title="Accounts Receivable Employee"
                subtitle="Assignment completed successfully."
                stepLabel={stepLabel}
                onClose={handleClose}
            />

            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                    duration: 0.35,
                    ease: tokens.motion.easing,
                }}
                className="flex flex-col items-center py-6"
            >

                <div
                    className="flex h-20 w-20 items-center justify-center rounded-full"
                    style={{
                        background: tokens.status.completed.background,
                    }}
                >
                    <Check
                        size={36}
                        strokeWidth={2.5}
                        color={tokens.semantic.success}
                    />
                </div>

                <h2
                    className="mt-6 text-[32px] font-semibold tracking-[-0.03em]"
                    style={{
                        color: tokens.semantic.textPrimary,
                    }}
                >
                    Assignment Complete
                </h2>

                <p
                    className="mt-4 max-w-[380px] text-center text-[15px] leading-7"
                    style={{
                        color: tokens.semantic.textSecondary,
                    }}
                >
                    I&apos;ve completed the work you assigned.
                    All invoices have been processed and added
                    to your workspace.
                </p>

            </motion.div>

            {/* Work Summary */}

            <div
                className="p-6"
                style={{
                    borderRadius: tokens.radius.container,
                    border: `1px solid ${tokens.semantic.border}`,
                    background: tokens.semantic.surfaceSecondary,
                }}
            >

                <h3
                    className="mb-5 text-[13px] font-medium uppercase tracking-[0.08em]"
                    style={{
                        color: tokens.semantic.textMuted,
                    }}
                >
                    Work Summary
                </h3>

                <div className="space-y-4">

                    <div className="flex items-center justify-between">

                        <span
                            className="text-[15px]"
                            style={{
                                color: tokens.semantic.textSecondary,
                            }}
                        >
                            Invoices Processed
                        </span>

                        <span
                            className="text-[16px] font-semibold"
                            style={{
                                color: tokens.semantic.textPrimary,
                            }}
                        >
                            {session?.processed_files}
                        </span>

                    </div>

                    {summaryChips.map((chip) => (
                        <div
                            key={chip.label}
                            className="flex items-center justify-between"
                        >
                            <span
                                className="text-[15px]"
                                style={{
                                    color: tokens.semantic.textSecondary,
                                }}
                            >
                                {chip.label}
                            </span>

                            <span
                                className="rounded-full px-3 py-1 text-[14px] font-semibold"
                                style={{
                                    background: chip.status.background,
                                    color: chip.status.text,
                                }}
                            >
                                {chip.value}
                            </span>
                        </div>
                    ))}

                </div>

            </div>

            <p
                className="mt-6 text-center text-[14px] leading-6"
                style={{
                    color: tokens.semantic.textMuted,
                }}
            >
                Everything has been added to your workspace.
                You can continue working while I monitor incoming invoices.
            </p>

            <Button
                variant="primary"
                onClick={handleClose}
                className="mt-8 w-full justify-center"
            >
                Return to Mission Control

                <ArrowRight size={16} strokeWidth={2} />
            </Button>
        </>
    );
}

    const total = session?.total_files ?? selectedFiles.length;
    const processed = session?.processed_files ?? 0;
    const percent = Math.round((processed / (total || 1)) * 100);

    return (
    <>
        <ModalHeader
            title="Accounts Receivable Employee"
            subtitle="Working on your request..."
            stepLabel={stepLabel}
            showBack
            onBack={onBack}
            onClose={onClose}
        />

        {!uploading ? (
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                    duration: 0.35,
                    ease: tokens.motion.easing,
                }}
            >
                <div
                    {...getRootProps()}
                    className="cursor-pointer p-10 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8F6B4A]/40"
                    style={{
                        borderRadius: tokens.radius.container,
                        border: `2px dashed ${
                            isDragActive
                                ? tokens.brand.primary
                                : tokens.semantic.border
                        }`,
                        background: isDragActive
                            ? tokens.semantic.surfaceWarm
                            : "transparent",
                    }}
                >
                    <input {...getInputProps()} />

                    <div className="flex flex-col items-center gap-3">

                        <div
                            className="flex h-12 w-12 items-center justify-center rounded-full"
                            style={{
                                background: tokens.semantic.surfaceWarm,
                            }}
                        >
                            <FileUp
                                size={20}
                                strokeWidth={1.8}
                                color={tokens.brand.primary}
                            />
                        </div>

                        <p
                            className="text-[14px]"
                            style={{
                                color: tokens.semantic.textSecondary,
                            }}
                        >
                            {isDragActive
                                ? "Drop your invoices here..."
                                : "Drag & drop PDF invoices here, or click to browse."}
                        </p>

                    </div>
                </div>

                {selectedFiles.length > 0 && (
                    <div
                        className="mt-6 p-4"
                        style={{
                            borderRadius: tokens.radius.container,
                            border: `1px solid ${tokens.semantic.border}`,
                            background: tokens.semantic.surfaceSecondary,
                        }}
                    >
                        <h3
                            className="mb-3 text-[13px] font-semibold"
                            style={{
                                color: tokens.semantic.textPrimary,
                            }}
                        >
                            Selected Files ({selectedFiles.length})
                        </h3>

                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {selectedFiles.map((file, index) => (
                                <div
                                    key={`${file.name}-${index}`}
                                    className="flex items-center justify-between p-2"
                                    style={{
                                        borderRadius: tokens.radius.container,
                                        border: `1px solid ${tokens.semantic.border}`,
                                        background: tokens.semantic.surface,
                                    }}
                                >
                                    <div className="flex items-center gap-3">

                                        <div
                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                                            style={{
                                                background:
                                                    tokens.semantic.surfaceWarm,
                                            }}
                                        >
                                            <FileText
                                                size={15}
                                                strokeWidth={1.8}
                                                color={tokens.brand.primary}
                                            />
                                        </div>

                                        <div>
                                            <p
                                                className="text-[13px] font-medium"
                                                style={{
                                                    color: tokens.semantic
                                                        .textPrimary,
                                                }}
                                            >
                                                {file.name}
                                            </p>

                                            <p
                                                className="text-[12px]"
                                                style={{
                                                    color: tokens.semantic
                                                        .textMuted,
                                                }}
                                            >
                                                {(file.size / 1024 / 1024).toFixed(
                                                    2
                                                )}{" "}
                                                MB
                                            </p>
                                        </div>

                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => removeFile(index)}
                                        disabled={uploading}
                                        aria-label={`Remove ${file.name}`}
                                        className="rounded-full px-3 py-1 text-[12px] font-medium transition-colors disabled:opacity-50"
                                        style={{
                                            color: tokens.semantic.danger,
                                        }}
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <Button
                    variant="primary"
                    onClick={handleUpload}
                    disabled={
                        selectedFiles.length === 0 ||
                        uploading
                    }
                    className="mt-6 w-full justify-center"
                >
                    Assign Work
                </Button>
            </motion.div>
        ) : (
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                    duration: 0.35,
                    ease: tokens.motion.easing,
                }}
            >
                {/* Progress */}

                <div
                    className="p-6"
                    style={{
                        borderRadius: tokens.radius.container,
                        border: `1px solid ${tokens.semantic.border}`,
                        background: tokens.semantic.surfaceSecondary,
                    }}
                >

                    <div className="flex items-center justify-between">

                        <div>

                            <p
                                className="text-[13px] font-medium uppercase tracking-[0.08em]"
                                style={{
                                    color: tokens.semantic.textMuted,
                                }}
                            >
                                Overall Progress
                            </p>

                            <h2
                                className="mt-2 text-[30px] font-semibold tracking-[-0.03em]"
                                style={{
                                    color: tokens.semantic.textPrimary,
                                }}
                            >
                                {processed} / {total}
                            </h2>

                            <p
                                className="mt-1 text-[14px]"
                                style={{
                                    color: tokens.semantic.textMuted,
                                }}
                            >
                                invoices completed
                            </p>

                        </div>

                        <div className="text-right">

                            <div
                                className="text-[40px] font-semibold"
                                style={{
                                    color: tokens.brand.primary,
                                }}
                            >
                                {percent}%
                            </div>

                            <p
                                className="text-[12px]"
                                style={{
                                    color: tokens.semantic.textMuted,
                                }}
                            >
                                Complete
                            </p>

                        </div>

                    </div>

                    <div
                        role="progressbar"
                        aria-valuenow={percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuetext={`${processed} of ${total} invoices processed`}
                        className="mt-6 h-3 overflow-hidden rounded-full"
                        style={{
                            background: tokens.semantic.border,
                        }}
                    >

                        <div
                            className="h-full rounded-full"
                            style={{
                                width: `${percent}%`,
                                background: tokens.brand.primary,
                                transition: `width ${tokens.motion.slow} ease`,
                            }}
                        />

                    </div>

                </div>

                {/* Live Activity */}

                {uploadSessionId && (
                    <EmployeeActivityFeed
                        uploadSessionId={uploadSessionId}
                    />
                )}

            </motion.div>
        )}
    </>
);
}

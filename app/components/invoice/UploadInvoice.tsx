import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";
import { createUploadSession,updateProcessedFiles,completeUploadSession } from "@/services/UploadSessionService";
import ModalHeader from "@/app/components/shared/ModalHeader";
import { uploadInvoice } from "@/services/storageService";
import { createInvoiceFile } from "@/services/invoiceFileService";
import { useUploadSession } from "@/app/hooks/useUploadSession";
import { processInvoiceAction } from "@/app/actions/processInvoiceAction";
import { useRouter } from "next/navigation";

import { logEmployeeActivity } from "@/services/EmployeeActivityService";
import EmployeeActivityFeed from "./EmployeeActivityFeed";


// import { extractInvoice } from "@/services/aiService";

type UploadInvoiceProps = {
    onBack: () => void;
    onClose: () => void;
    onReviewResults?: () => void;
};

export default function UploadInvoice({
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
            alert("One or more uploads failed.");
        } finally {
            setUploading(false);
        }
    };

   

if (completed) {
    return (
        <>
            <ModalHeader
                title="Accounts Receivable Employee"
                subtitle="Assignment completed successfully."
                onClose={handleClose}
            />

            <div className="flex flex-col items-center py-6">

                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#EEF7EC]">

                    <svg
                        width="36"
                        height="36"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#5F8F58"
                        strokeWidth="2.5"
                    >
                        <path d="M20 6L9 17l-5-5" />
                    </svg>

                </div>

                <h2 className="mt-6 text-[32px] font-semibold tracking-[-0.03em] text-[#23201D]">
                    Assignment Complete
                </h2>

                <p className="mt-4 max-w-[380px] text-center text-[15px] leading-7 text-[#6E6963]">
                    I've completed the work you assigned.
                    All invoices have been processed and added
                    to your workspace.
                </p>

            </div>

            {/* Work Summary */}

            <div className="rounded-2xl border border-[#ECE5DD] bg-[#FCFBF8] p-6">

                <h3 className="mb-5 text-[13px] font-medium uppercase tracking-[0.08em] text-[#9B938B]">
                    Work Summary
                </h3>

                <div className="space-y-4">

                    <div className="flex items-center justify-between">

                        <span className="text-[15px] text-[#6E6963]">
                            Invoices Processed
                        </span>

                        <span className="text-[16px] font-semibold text-[#23201D]">
                            {session?.processed_files}
                        </span>

                    </div>

                    <div className="flex items-center justify-between">

                        <span className="text-[15px] text-[#6E6963]">
                            Approved Automatically
                        </span>

                        <span className="text-[16px] font-semibold text-[#5F8F58]">
                            {session?.processed_files}
                        </span>

                    </div>

                    <div className="flex items-center justify-between">

                        <span className="text-[15px] text-[#6E6963]">
                            Needs Your Review
                        </span>

                        <span className="text-[16px] font-semibold text-[#A47A45]">
                            0
                        </span>

                    </div>

                </div>

            </div>

            <p className="mt-6 text-center text-[14px] leading-6 text-[#7D7D7D]">
                Everything has been added to your workspace.
                You can continue working while I monitor incoming invoices.
            </p>

            <button
    onClick={handleClose}
    className="mt-8 w-full rounded-xl bg-[#A47A45] py-3 text-[15px] font-medium text-white transition hover:bg-[#946B3D]"
>
    Review Results →
</button>
        </>
    );
}

    return (
    <>
        <ModalHeader
            title="Accounts Receivable Employee"
            subtitle="Working on your request..."
            onClose={onClose}
        />

        {!uploading ? (
            <>
                <div
                    {...getRootProps()}
                    className="cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-10 text-center transition hover:border-blue-500"
                >
                    <input {...getInputProps()} />

                    {isDragActive ? (
                        <p>Drop your invoices here...</p>
                    ) : (
                        <p>
                            Drag & drop PDF invoices here, or click to browse.
                        </p>
                    )}
                </div>

                {selectedFiles.length > 0 && (
                    <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <h3 className="mb-3 font-semibold">
                            Selected Files ({selectedFiles.length})
                        </h3>

                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {selectedFiles.map((file, index) => (
                                <div
                                    key={`${file.name}-${index}`}
                                    className="flex items-center justify-between rounded-md border bg-white px-3 py-2"
                                >
                                    <div>
                                        <p className="font-medium">
                                            {file.name}
                                        </p>

                                        <p className="text-sm text-gray-500">
                                            {(file.size / 1024 / 1024).toFixed(
                                                2
                                            )}{" "}
                                            MB
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => removeFile(index)}
                                        disabled={uploading}
                                        className="rounded-md bg-red-100 px-3 py-1 text-sm text-red-600 transition hover:bg-red-200 disabled:opacity-50"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <button
                    onClick={handleUpload}
                    disabled={
                        selectedFiles.length === 0 ||
                        uploading
                    }
                    className="mt-6 w-full rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition hover:bg-blue-700 disabled:bg-gray-400"
                >
                    Assign Work
                </button>
            </>
        ) : (
            <>
                {/* Progress */}

                <div className="rounded-2xl border border-[#ECE5DD] bg-[#FCFBF8] p-6">

                    <div className="flex items-center justify-between">

                        <div>

                            <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#9B938B]">
                                Overall Progress
                            </p>

                            <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-[#23201D]">
                                {session?.processed_files ?? 0} /{" "}
                                {session?.total_files ??
                                    selectedFiles.length}
                            </h2>

                            <p className="mt-1 text-[14px] text-[#7D7D7D]">
                                invoices completed
                            </p>

                        </div>

                        <div className="text-right">

                            <div className="text-[40px] font-semibold text-[#A47A45]">

                                {Math.round(
                                    (((session?.processed_files ??
                                        0) /
                                        ((session?.total_files ??
                                            selectedFiles.length) ||
                                            1)) *
                                        100)
                                )}
                                %

                            </div>

                            <p className="text-[12px] text-[#8A847C]">
                                Complete
                            </p>

                        </div>

                    </div>

                    <div className="mt-6 h-3 overflow-hidden rounded-full bg-[#ECE5DD]">

                        <div
                            className="h-full rounded-full bg-[#A47A45] transition-all duration-500"
                            style={{
                                width: `${
                                    (((session?.processed_files ??
                                        0) /
                                        ((session?.total_files ??
                                            selectedFiles.length) ||
                                            1))) *
                                    100
                                }%`,
                            }}
                        />

                    </div>

                </div>

                {/* Progress */}

<div className="mt-6">

    <div className="flex items-center justify-between">

        <span className="text-[14px] font-medium text-[#2C2B29]">
            Overall Progress
        </span>

        <span className="text-[13px] text-[#7D7D7D]">
            {session?.processed_files ?? 0} / {session?.total_files ?? 0}
        </span>

    </div>

    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ECE5DD]">

        <div
            className="h-full rounded-full bg-[#A47A45] transition-all duration-500"
            style={{
                width: `${
                    session
                        ? (session.processed_files /
                              session.total_files) *
                          100
                        : 0
                }%`,
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

</>
        )}
    </>
);
                            }
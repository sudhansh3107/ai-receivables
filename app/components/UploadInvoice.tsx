import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { createUploadSession } from "@/services/UploadSessionService";
import ModalHeader from "./ModalHeader";
import { uploadInvoice } from "@/services/storageService";
// import { extractInvoice } from "@/services/aiService";

type UploadInvoiceProps = {
    onBack: () => void;
    onClose: () => void;
};

export default function UploadInvoice({
    onBack,
    onClose,
}: UploadInvoiceProps) {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);

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

            const uploadSession = await createUploadSession(selectedFiles.length);

            for (const file of selectedFiles) {
            const uploadResult = await uploadInvoice(file);

            console.log(uploadResult);
            }
            
     //       for (const file of selectedFiles) {
      //          console.log(`Uploading ${file.name}...`);
//
        //        const uploadResult = await uploadInvoice(file);

              //  const extractedData = await extractInvoice(uploadResult.path);

       //         console.log("Upload Result:", uploadResult);
             //   console.log("Extracted Data:", extractedData);
            
              // TODO: Re-enable after OCR + AI extraction pipeline is implemented.              
     //       }

            alert(`${selectedFiles.length} invoice(s) uploaded successfully!`);

            setSelectedFiles([]);
        } catch (error) {
            console.error(error);
            alert("One or more uploads failed.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <>
            <ModalHeader
                title="Upload Invoice"
                showBack
                onBack={onBack}
                onClose={onClose}
            />

            <div
                {...getRootProps()}
                className="cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-10 text-center transition hover:border-blue-500"
            >
                <input {...getInputProps()} />

                {isDragActive ? (
                    <p>Drop your invoices here...</p>
                ) : (
                    <p>Drag & drop PDF invoices here, or click to browse.</p>
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
                                    <p className="font-medium">{file.name}</p>
                                    <p className="text-sm text-gray-500">
                                        {(file.size / 1024 / 1024).toFixed(2)} MB
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
                disabled={selectedFiles.length === 0 || uploading}
                className="mt-6 w-full rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition hover:bg-blue-700 disabled:bg-gray-400"
            >
                {uploading
                    ? "Uploading..."
                    : `Upload ${selectedFiles.length || ""} Invoice${
                          selectedFiles.length === 1 ? "" : "s"
                      }`}
            </button>
        </>
    );
}
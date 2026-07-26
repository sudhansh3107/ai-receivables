import { supabase } from "@/lib/supabase";

type CreateInvoiceFileParams = {
    uploadSessionId: string;
    fileName: string;
    storagePath: string;
    mimeType: string;
    fileSizeBytes: number;
};

export async function createInvoiceFile({
    uploadSessionId,
    fileName,
    storagePath,
    mimeType,
    fileSizeBytes,
}: CreateInvoiceFileParams) {
    const { data, error } = await supabase
        .from("invoice_files")
        .insert({
            upload_session_id: uploadSessionId,
            file_name: fileName,
            storage_path: storagePath,
            mime_type: mimeType,
            file_size_bytes: fileSizeBytes,
            processing_status: "uploaded",
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}
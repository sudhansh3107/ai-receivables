import { supabase } from "@/lib/supabase";

const BUCKET_NAME = "invoices";

export async function uploadInvoice(file: File) {
    const fileName = `${Date.now()}-${file.name}`;

    const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, file);

    if (error) {
        throw error;
    }

    return data;
}
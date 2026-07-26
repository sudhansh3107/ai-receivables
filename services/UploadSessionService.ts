import { supabase } from "@/lib/supabase";

export async function createUploadSession(totalFiles: number) {
    console.log("Creating upload session...");

    const { data, error } = await supabase
        .from("upload_sessions")
        .insert({
            processing_status: "processing",
            total_files: totalFiles,
            processed_files: 0,
        })
        .select()
        .single();

    console.log("Supabase response:", { data, error });

    if (error) {
        throw error;
    }

    return data;
}
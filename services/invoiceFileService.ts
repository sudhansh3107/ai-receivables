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

export async function getInvoiceFile(invoiceFileId: string) {
  const { data, error } = await supabase
    .from("invoice_files")
    .select("*")
    .eq("id", invoiceFileId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function linkInvoiceToFile(
    invoiceFileId: string,
    invoiceId: string
) {
    const { data, error } = await supabase
        .from("invoice_files")
        .update({
            invoice_id: invoiceId,
        })
        .eq("id", invoiceFileId)
        .select()
        .single();

    if (error) throw error;

    return data;
}

export async function updateProcessingStatus(
  invoiceFileId: string,
  status: "uploaded" | "processing" | "processed" | "failed",
  failureReason?: string
) {
  const { error } = await supabase
    .from("invoice_files")
    .update({
      processing_status: status,
      failure_reason: failureReason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceFileId);

  if (error) {
    throw error;
  }
}

// Employee-owned WORK signal for Mission Card (services/server/
// dashboardService.ts::getMissionSummary()): invoice files currently
// being extracted — genuinely durable, autonomous, no human input
// mid-flight. Counted at the file granularity (not upload_sessions)
// so the same underlying work is never counted at two levels.
export async function getProcessingInvoiceFileCount(): Promise<number> {
  const { count, error } = await supabase
    .from("invoice_files")
    .select("*", {
      head: true,
      count: "exact",
    })
    .eq("processing_status", "processing");

  if (error) {
    throw error;
  }

  return count ?? 0;
}
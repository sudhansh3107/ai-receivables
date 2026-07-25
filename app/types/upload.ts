export type UploadStatus =
  | "waiting"
  | "uploading"
  | "uploaded"
  | "failed";

export interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  error?: string;
}
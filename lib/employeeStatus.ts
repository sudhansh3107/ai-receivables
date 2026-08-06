import {
  Brain,
  CheckCircle2,
  Database,
  FileText,
  LucideIcon,
  ScanText,
} from "lucide-react";

export type EmployeeStatus = {
  icon: LucideIcon;
  title: string;
  message: string;
};

export function getEmployeeStatus(
  status: string
): EmployeeStatus {
  switch (status) {
    case "uploading":
      return {
        icon: FileText,
        title: "Receiving Work",
        message:
          "Collecting invoices from your workspace.",
      };

    case "processing":
      return {
        icon: ScanText,
        title: "Reading Invoice",
        message:
          "Extracting invoice details and validating data.",
      };

    case "matching":
      return {
        icon: Brain,
        title: "Matching Customer",
        message:
          "Comparing with previous invoices and payment history.",
      };

    case "saving":
      return {
        icon: Database,
        title: "Updating Records",
        message:
          "Saving structured data to the receivables workspace.",
      };

    case "uploaded":
      return {
        icon: CheckCircle2,
        title: "Work Completed",
        message:
          "Invoices have been successfully processed.",
      };

    default:
      return {
        icon: Brain,
        title: "Preparing",
        message:
          "Getting everything ready...",
      };
  }
}
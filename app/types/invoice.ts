export type Invoice = {
  id: number;
  invoice_number: string;
  vendor_name: string;
  invoice_total: number;
  status: string;
  currency: string;
};
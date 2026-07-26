export type Invoice = {
  id: string;
  invoice_number: string;
  invoice_amount: number;
  status: string;
  currency: string;

  customers: {
    company_name: string;
  } | null;
};
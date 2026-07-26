export interface InvoiceConfidenceResult {
  score: number;
  level: "high" | "medium" | "low";
  reasons: string[];
}

export interface InvoiceConfidenceInput {
  extractedInvoice: {
    invoiceNumber: string;
    companyName: string;
    invoiceAmount: number;
    currency: string;
    invoiceDate: string;
    dueDate: string;
  };

  customerExists: boolean;
  isDuplicate: boolean;
  validationPassed: boolean;
}

export function calculateInvoiceConfidence(
  input: InvoiceConfidenceInput
): InvoiceConfidenceResult {
  let score = 0;
  const reasons: string[] = [];
  
  const CONFIDENCE_WEIGHTS = {
    invoiceNumber: 15,
    companyName: 15,
    invoiceAmount: 15,
    currency: 10,
    invoiceDate: 10,
    dueDate: 10,
    existingCustomer: 10,
    notDuplicate: 5,
    validationPassed: 10,
} as const;

  if (input.extractedInvoice.invoiceNumber) {
    score += CONFIDENCE_WEIGHTS.invoiceNumber;
    reasons.push("Invoice number detected");
  }

  if (input.extractedInvoice.companyName) {
    score += CONFIDENCE_WEIGHTS.companyName;
    reasons.push("Company name detected");
  }

  if (input.extractedInvoice.invoiceAmount > 0) {
    score += CONFIDENCE_WEIGHTS.invoiceAmount;
    reasons.push("Invoice amount is valid");
  }

  if (input.extractedInvoice.currency) {
    score += CONFIDENCE_WEIGHTS.currency;
    reasons.push("Currency detected");
  }

  if (input.extractedInvoice.invoiceDate) {
    score += CONFIDENCE_WEIGHTS.invoiceDate;
    reasons.push("Invoice date detected");
  }

  if (input.extractedInvoice.dueDate) {
    score += CONFIDENCE_WEIGHTS.dueDate;
    reasons.push("Due date detected");
  }

  if (input.customerExists) {
    score += CONFIDENCE_WEIGHTS.existingCustomer;
    reasons.push("Existing customer matched");
  } else {
    reasons.push("New customer created");
}

  if (!input.isDuplicate) {
    score += CONFIDENCE_WEIGHTS.notDuplicate;
    reasons.push("No duplicate invoice found");
  } else{
    reasons.push("Duplicate invoice detected");
}

  if (input.validationPassed) {
    score += CONFIDENCE_WEIGHTS.validationPassed;
    reasons.push("Invoice passed validation");
  }

  let level: InvoiceConfidenceResult["level"];

  if (score >= 90) {
    level = "high";
  } else if (score >= 70) {
    level = "medium";
  } else {
    level = "low";
  }

  return {
    score,
    level,
    reasons,
  };
}
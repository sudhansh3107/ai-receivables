# ==========================================================
# INVOICE BIBLE
# InsightBlend Analytics LLP
# ==========================================================

> Version: 1.0
> Status: Draft
> Owner: VSB Labs
> Last Updated: August 2026

---

# Purpose

The Invoice Bible defines how invoices are generated, managed and
processed within the Orion MVP.

Every invoice in the demo dataset MUST follow the rules defined in
this document.

This document acts as the blueprint for invoice generation and
ensures consistency across the application.

---

# Invoice Overview

Invoices are generated after successful completion of a training
engagement, workshop, consulting assignment or certification program.

Every invoice belongs to exactly one client.

Every invoice is managed by Orion after it is issued.

---

# Invoice Numbering

Invoice Prefix

IBA

Format

IBA-YYYY-NNNN

Example

IBA-2026-0001

IBA-2026-0002

IBA-2026-0003

Invoice numbers are sequential.

Invoice numbers are never reused.

---

# Invoice Lifecycle

Proposal Approved

↓

Training Delivered

↓

Invoice Generated

↓

Invoice Sent

↓

Payment Due

↓

Paid

OR

↓

Partially Paid

↓

Outstanding

↓

Escalated

↓

Closed

---

# Invoice Statuses

Draft

Invoice created but not yet sent.

Sent

Invoice successfully delivered to the client.

Due

Payment is expected within agreed terms.

Overdue

Due date has passed.

Partially Paid

Partial payment received.

Paid

Invoice fully settled.

Cancelled

Invoice withdrawn.

---

# Invoice Types

Corporate Training

College Training

University Program

Certification Bootcamp

AI Workshop

Consulting Engagement

Annual Training Contract

---

# Invoice Value Distribution

College Programs

₹80,000 – ₹2,00,000

Corporate Training

₹1,50,000 – ₹5,00,000

University Programs

₹2,00,000 – ₹4,00,000

Training Partners

₹1,00,000 – ₹2,50,000

Government Projects

₹3,00,000 – ₹6,00,000

Startup Workshops

₹40,000 – ₹1,00,000

---

# Payment Terms

Premium Clients

Net 15

Standard Clients

Net 30

Enterprise Clients

Net 45

Government Clients

Net 60

Advance Workshops

100% Advance Payment

---

# Tax Rules

Currency

INR (₹)

GST

18%

GST Included

No

Invoice Total

Subtotal

+

GST

=

Grand Total

---

# Required Invoice Fields

Invoice Number

Client ID

Client Name

Invoice Type

Invoice Date

Due Date

Subtotal

GST

Grand Total

Currency

Payment Terms

Status

Assigned Digital Employee

Created At

Updated At

---

# Demo Dataset

Operational Period

1 May 2026

↓

4 August 2026

Target Invoice Count

150

Monthly Distribution

May

40

June

50

July

40

August

20

---

# Current Invoice Status Distribution

Paid

125

Outstanding

15

Partially Paid

10

Cancelled

0

Total

150

---

# Business Rules

Every invoice belongs to one client.

Every invoice has one payment term.

Every invoice is assigned to Orion.

Invoices cannot be deleted.

Cancelled invoices remain in history.

Due dates are automatically calculated using payment terms.

Outstanding invoices automatically enter the reminder workflow.

Paid invoices immediately exit the reminder workflow.

---

# AI Rules

After an invoice is uploaded Orion will:

• Extract invoice information

• Validate business fields

• Calculate due date

• Calculate confidence score

• Detect duplicates

• Schedule reminders

• Assign collection priority

• Update the executive dashboard

• Create an activity log

---

# Dashboard Impact

Invoices directly affect

• Executive Briefing

• Mission Card

• Outstanding Amount

• Collection Forecast

• Activity Timeline

• Orion's Work Queue

• Customer Intelligence

---

# Future Enhancements

Future versions may support

• Multi-currency invoices

• Credit Notes

• Debit Notes

• Recurring invoices

• Subscription billing

• Milestone billing

• Purchase Order matching

---

# Change Log

## Version 1.0

- Initial invoice lifecycle
- Invoice numbering convention
- Payment term definitions
- Demo dataset specification
- Business rules
- AI processing workflow
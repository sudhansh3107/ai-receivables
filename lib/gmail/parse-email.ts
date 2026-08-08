import { gmail_v1 } from "googleapis";

export type NormalizedEmailAttachment = {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId?: string;
};

export type NormalizedEmail = {
  messageId: string;
  threadId: string;

  from: string;
  to: string[];
  cc: string[];

  subject: string;
  receivedAt: string;

  textBody: string | null;
  htmlBody: string | null;

  attachments: NormalizedEmailAttachment[];
};

function decodeBase64Url(data?: string): string {
  if (!data) return "";

  const normalized = data
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );

  return Buffer.from(padded, "base64").toString("utf-8");
}

function cleanText(text: string): string {
    return text
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  return (
    headers?.find(
      (header) =>
        header.name?.toLowerCase() === name.toLowerCase()
    )?.value || ""
  );
}

function splitAddresses(value: string): string[] {
  if (!value) return [];

  return value
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

function stripHtml(html: string): string {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, lines) => {
      if (line !== "") return true;

      return (
        index > 0 &&
        index < lines.length - 1 &&
        lines[index - 1] !== ""
      );
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseGmailMessage(
  message: gmail_v1.Schema$Message
): NormalizedEmail {
  const payload = message.payload;

  let textBody: string | null = null;
  let htmlBody: string | null = null;

  const attachments: NormalizedEmailAttachment[] = [];

  function walkParts(
    part: gmail_v1.Schema$MessagePart | undefined
  ) {
    if (!part) return;

    const mimeType = part.mimeType || "";

    if (part.parts?.length) {
      for (const child of part.parts) {
        walkParts(child);
      }
    }

    if (part.filename && part.filename.length > 0) {
      attachments.push({
        filename: part.filename,
        mimeType,
        size: Number(part.body?.size || 0),
        attachmentId: part.body?.attachmentId || undefined,
      });

      return;
    }

    if (
      mimeType === "text/plain" &&
      part.body?.data
    ) {
      const decoded = decodeBase64Url(part.body.data);

      if (!textBody) {
        textBody = decoded;
      } else {
        textBody += "\n\n" + decoded;
      }
    }

    if (
      mimeType === "text/html" &&
      part.body?.data
    ) {
      const decoded = decodeBase64Url(part.body.data);

      if (!htmlBody) {
        htmlBody = decoded;
      } else {
        htmlBody += "\n\n" + decoded;
      }
    }
  }

  walkParts(payload);

  if (
    !payload?.parts?.length &&
    payload?.body?.data
  ) {
    const decoded = decodeBase64Url(payload.body.data);

    if (payload.mimeType === "text/plain") {
      textBody = decoded;
    }

    if (payload.mimeType === "text/html") {
      htmlBody = decoded;
    }
  }

  const headers = payload?.headers;

  const from = getHeader(headers, "From");
  const to = getHeader(headers, "To");
  const cc = getHeader(headers, "Cc");


return {
  messageId: message.id || "",
  threadId: message.threadId || "",

  from,
  to: splitAddresses(to),
  cc: splitAddresses(cc),

  subject: getHeader(headers, "Subject"),

  receivedAt:
    getHeader(headers, "Date") ||
    new Date().toISOString(),

  textBody:
    textBody
      ? normalizeText(textBody)
      : htmlBody
        ? stripHtml(htmlBody)
        : null,

  htmlBody:
    htmlBody?.trim() || null,

  attachments,
};
}
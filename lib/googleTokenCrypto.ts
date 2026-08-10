import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function getEncryptionKey(): Buffer {
    const rawKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;

    if (!rawKey) {
        throw new Error(
            "GMAIL_TOKEN_ENCRYPTION_KEY environment variable is not set. " +
                "It must be a 64-character hex string (32 bytes) for AES-256-GCM."
        );
    }

    if (!/^[0-9a-fA-F]{64}$/.test(rawKey)) {
        throw new Error(
            "GMAIL_TOKEN_ENCRYPTION_KEY is invalid. Expected a 64-character " +
                "hex string (32 bytes) for AES-256-GCM."
        );
    }

    const key = Buffer.from(rawKey, "hex");

    if (key.length !== KEY_BYTES) {
        throw new Error(
            `GMAIL_TOKEN_ENCRYPTION_KEY decoded to ${key.length} bytes; expected ${KEY_BYTES}.`
        );
    }

    return key;
}

// Stored format: base64(iv[12] || authTag[16] || ciphertext[n]).
// Self-contained so decrypt() never needs anything beyond the column
// value and the server-side encryption key.
export function encryptRefreshToken(plaintext: string): string {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_BYTES);

    const cipher = createCipheriv(ALGORITHM, key, iv);

    const ciphertext = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptRefreshToken(encoded: string): string {
    const key = getEncryptionKey();
    const buffer = Buffer.from(encoded, "base64");

    if (buffer.length < IV_BYTES + AUTH_TAG_BYTES) {
        throw new Error(
            "Encrypted refresh token is malformed (too short to contain IV + auth tag)."
        );
    }

    const iv = buffer.subarray(0, IV_BYTES);
    const authTag = buffer.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
    const ciphertext = buffer.subarray(IV_BYTES + AUTH_TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]);

    return plaintext.toString("utf8");
}

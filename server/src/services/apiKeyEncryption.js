import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;

const getKey = () => {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is required for API key encryption");
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_LENGTH) {
    throw new Error("ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
};

export const encryptApiKey = (plaintext) => {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("API key must be a non-empty string");
  }
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), crypto.randomBytes(IV_LENGTH));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    encrypted: encrypted.toString("base64"),
    iv: cipher.getIV().toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
};

export const decryptApiKey = ({ encrypted, iv, tag }) => {
  if (!encrypted || !iv || !tag) throw new Error("Invalid encrypted API key payload");
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Failed to decrypt API key");
  }
};

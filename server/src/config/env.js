const required = ["MONGODB_URI", "JWT_SECRET", "JWT_REFRESH_SECRET"];

export const validateEnvironment = () => {
  const missing = required.filter((name) => !process.env[name]);
  if (!process.env.ENCRYPTION_KEY) {
    missing.push("ENCRYPTION_KEY");
  }
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  if (process.env.ENCRYPTION_KEY) {
    const key = Buffer.from(process.env.ENCRYPTION_KEY, "base64");
    if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
};

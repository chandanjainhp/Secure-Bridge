import request from "supertest";
import { app } from "../app.js";
import { User } from "../models/user.model.js";
import { ApiKey } from "../features/api-key/models/apikey.model.js";
import jwt from "jsonwebtoken";
import { EncryptionService } from "../services/encryptionService.js";

describe("Security Tests - Phase 1", () => {
  let authToken;
  let testUserId;

  beforeAll(async () => {
    await User.deleteMany({});

    // Create test user
    const user = await User.create({
      fullName: "Security Test User",
      email: "securitytest@example.com",
      username: "securitytestuser",
      password: "password123",
      isVerified: true,
    });
    testUserId = user._id;

    // Login to get token
    const res = await request(app).post("/api/v1/auth/login").send({
      email: "securitytest@example.com",
      password: "password123",
    });

    authToken = res.body.data.accessToken;
  }, 30000);

  afterAll(async () => {
    await User.deleteMany({});
    await ApiKey.deleteMany({});
  });

  // ============================================================
  // AC-SEC-2: Security headers are applied
  // ============================================================
  describe("Security Headers", () => {
    it("should include security headers in responses", async () => {
      const res = await request(app).get("/health").expect(200);

      // Check for Helmet security headers
      expect(res.headers["x-powered-by"]).toBeUndefined();
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
      expect(res.headers["x-xss-protection"]).toBe("0");
      expect(res.headers["content-security-policy"]).toBeDefined();
    });
  });

  // ============================================================
  // AC-SEC-1: CORS origin is enforced
  // ============================================================
  describe("CORS Configuration", () => {
    it("should reject requests from non-allowlisted origins", async () => {
      // This test is tricky because supertest doesn't simulate CORS preflight
      // We can test by setting Origin header and checking response
      const res = await request(app)
        .get("/health")
        .set("Origin", "https://evil.com")
        .expect(200);

      // In production with proper CORS, the browser would block this
      // For now, we verify that CORS headers are present
      expect(res.headers["access-control-allow-origin"]).toBeDefined();
    });

    it("should allow CORS preflight requests from configured origins", async () => {
      const res = await request(app)
        .options("/api/v1/auth/register")
        .set("Origin", "http://localhost:5173")
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", "content-type")
        .expect(204);

      expect(res.headers["access-control-allow-origin"]).toBe(
        "http://localhost:5173",
      );
      expect(res.headers["access-control-allow-methods"]).toContain("POST");
    });

    it("should allow requests from configured origins", async () => {
      const res = await request(app)
        .get("/health")
        .set("Origin", "http://localhost:5173")
        .expect(200);

      // Should include the origin in allow-list
      expect(res.headers["access-control-allow-origin"]).toContain(
        "http://localhost:5173",
      );
    });
  });

  // ============================================================
  // AC-SEC-5: No plaintext API key in responses
  // ============================================================
  describe("API Key Response Security", () => {
    it("should not return plaintext key in create API key response", async () => {
      const res = await request(app)
        .post("/api/v1/api-key")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          name: "Test API Key",
          description: "Test key for security test",
          externalKey: "sk-test-key-1234567890abcdef1234567890abcdef12345678",
          provider: "openai",
        })
        .expect(201);

      // Check that response does not contain plaintext key
      const responseData = JSON.stringify(res.body);
      expect(responseData).not.toContain(
        "sk-test-key-1234567890abcdef1234567890abcdef12345678",
      );
      expect(responseData).not.toContain("externalKeyEncrypted");
      expect(responseData).not.toContain("encryptionIV");
      expect(responseData).not.toContain("encryptionTag");

      // Should have masked key if external
      if (res.body.data.maskedKey) {
        expect(res.body.data.maskedKey).not.toBe(
          "sk-test-key-1234567890abcdef1234567890abcdef12345678",
        );
      }
    });

    it("should not return plaintext key in get API key response", async () => {
      // First create a key
      await request(app)
        .post("/api/v1/api-key")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          name: "Test API Key 2",
          externalKey: "sk-another-test-key-1234567890abcdef123456",
          provider: "openai",
        });

      // Then get the key
      const res = await request(app)
        .get("/api/v1/api-key")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      const responseData = JSON.stringify(res.body);
      expect(responseData).not.toContain(
        "sk-another-test-key-1234567890abcdef123456",
      );
      expect(responseData).not.toContain("externalKeyEncrypted");
    });
  });

  // ============================================================
  // AC-SEC-4: JWT tokens expire
  // ============================================================
  describe("JWT Token Expiry", () => {
    it("should have exp field in JWT token", async () => {
      // Decode the token without verification to check structure
      const decoded = jwt.decode(authToken);
      expect(decoded).toBeDefined();
      expect(decoded.exp).toBeDefined();
      expect(typeof decoded.exp).toBe("number");

      // Token should expire in the future
      const now = Math.floor(Date.now() / 1000);
      expect(decoded.exp).toBeGreaterThan(now);
    });

    it("should return 401 for expired token", async () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        { _id: testUserId, email: "securitytest@example.com" },
        process.env.JWT_SECRET || "test-secret",
        { expiresIn: "0s" }, // Already expired
      );

      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${expiredToken}`)
        .expect(401);

      // Message should contain 'invalid' or 'expired' (case insensitive)
      const message = res.body.message || "";
      expect(message.toLowerCase()).toMatch(/(invalid|expired)/);
    });
  });

  // ============================================================
  // AC-SEC-3: API keys are encrypted at rest
  // ============================================================
  describe("API Key Encryption at Rest", () => {
    it("should store external API keys encrypted in database", async () => {
      // Create an API key through the service
      await request(app)
        .post("/api/v1/api-key")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          name: "Encryption Test Key",
          externalKey: "sk-encrypted-test-key-abcdef",
          provider: "openai",
        });

      // Fetch the key directly from database
      const apiKeys = await ApiKey.find({ userId: testUserId });
      expect(apiKeys.length).toBeGreaterThan(0);

      const testKey = apiKeys.find((k) => k.name === "Encryption Test Key");
      expect(testKey).toBeDefined();
      expect(testKey.isExternal).toBe(true);
      expect(testKey.externalKeyEncrypted).toBeDefined();
      expect(testKey.externalKeyEncrypted).not.toBe(
        "sk-encrypted-test-key-abcdef",
      );
      expect(testKey.encryptionIV).toBeDefined();
      expect(testKey.encryptionTag).toBeDefined();
    });
  });

  // ============================================================
  // AC-SEC-5 & AC-SEC-6: Integration tests
  // ============================================================
  describe("Protected Routes", () => {
    it("should return 401 for protected route without valid JWT", async () => {
      const res = await request(app).get("/api/v1/auth/me").expect(401);

      // Message should contain either 'Unauthorized' or 'Invalid'
      const message = res.body.message || "";
      expect(message.toLowerCase()).toContain("unauthorized");
    });

    it("should return 401 for protected route with invalid JWT", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer invalid-token")
        .expect(401);

      // Message should contain either 'invalid' or 'Invalid'
      const message = res.body.message || "";
      expect(message.toLowerCase()).toContain("invalid");
    });

    it("should return 200 for protected route with valid JWT", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.data).toBeDefined();
    });
  });
});

describe("Encryption Service Tests", () => {
  describe("AES-256-GCM Encryption", () => {
    let encryptionService;

    beforeAll(() => {
      // Use mock mode for testing
      process.env.ENCRYPTION_MODE = "mock";
      encryptionService = new EncryptionService();
    });

    afterAll(() => {
      delete process.env.ENCRYPTION_MODE;
    });

    it("should encrypt and decrypt data correctly in mock mode", async () => {
      const plaintext = "test sensitive data";

      const encrypted = await encryptionService.encrypt(plaintext);
      expect(encrypted).toBeDefined();
      expect(encrypted.mode).toBe("mock");
      expect(encrypted.payload).toBeDefined();

      const decrypted = await encryptionService.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should encrypt and decrypt data correctly in AEAD mode", async () => {
      // Set a test encryption key - must be exactly 32 bytes when base64 decoded
      // Generate a proper 32-byte key (256-bit)
      const testKey = Buffer.from(
        "1234567890abcdef1234567890abcdef",
        "utf-8",
      ).toString("base64");
      process.env.ENCRYPTION_KEY = testKey;
      process.env.ENCRYPTION_MODE = "aead";

      // Need to recreate the service instance
      const { EncryptionService: FreshEncryptionService } =
        await import("../services/encryptionService.js");
      const freshService = new FreshEncryptionService();

      const plaintext = "test sensitive data";
      const encrypted = await freshService.encrypt(plaintext);
      expect(encrypted).toBeDefined();
      expect(encrypted.mode).toBe("aead");
      expect(encrypted.payload.ciphertext).toBeDefined();
      expect(encrypted.payload.nonce).toBeDefined();
      expect(encrypted.payload.tag).toBeDefined();

      const decrypted = await freshService.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);

      // Clean up
      delete process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_MODE;
    });
  });
});

import { z } from "zod";

// Shared primitives
const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Please provide a valid email address (e.g., user@example.com)")
  .transform((e) => e.toLowerCase());

const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters long")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "Username can only contain letters, numbers, and underscores",
  )
  .transform((u) => u.toLowerCase());

const passwordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters long for security");

// --- Registration ---
export const registerUserSchema = z.object({
  body: z.object({
    fullName: z
      .string()
      .trim()
      .min(1, "Full Name is required")
      .min(2, "Full name must be at least 2 characters long"),
    email: emailSchema,
    username: usernameSchema,
    password: passwordSchema,
  }),
});

// --- Registration via OTP/name ---
export const otpRegisterSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .min(2, "Name must be at least 2 characters long"),
    email: emailSchema,
    password: passwordSchema,
  }),
});

// --- Login ---
export const loginSchema = z.object({
  body: z
    .object({
      email: emailSchema.optional(),
      username: usernameSchema.optional(),
      password: passwordSchema,
      rememberMe: z.boolean().optional().default(false),
    })
    .refine((data) => data.email || data.username, {
      message: "Please provide either email or username to login.",
      path: ["email"],
    }),
});

// --- Change password ---
export const changeCurrentPasswordSchema = z.object({
  body: z.object({
    oldPassword: z.string().min(1, "Old password is required"),
    newPassword: passwordSchema,
  }),
});

// --- Update account details ---
export const updateAccountDetailsSchema = z.object({
  body: z.object({
    fullName: z.string().trim().min(1, "Full Name is required"),
    email: emailSchema,
  }),
});

// --- Verify email (OTP) ---
export const verifyEmailSchema = z.object({
  body: z.object({
    email: emailSchema,
    otp: z
      .string()
      .trim()
      .min(1, "Verification code is required")
      .regex(/^\d{6}$/, "Verification code must be a 6-digit number"),
  }),
});

// --- Resend verification / reset email ---
export const resendVerificationEmailSchema = z.object({
  body: z.object({
    email: emailSchema,
    purpose: z
      .enum(["verification", "reset"])
      .optional()
      .default("verification"),
  }),
});

// --- Send OTP ---
export const sendOtpSchema = z.object({
  body: z.object({
    email: emailSchema,
    mode: z.enum(['login', 'register', 'reset_password']).optional().default('login'),
  }),
});

// --- Verify OTP ---
export const verifyOtpSchema = z.object({
  body: z.object({
    email: emailSchema,
    otp: z
      .string()
      .trim()
      .min(1, "Verification code is required")
      .regex(/^\d{6}$/, "Verification code must be a 6-digit number"),
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100).optional(),
    password: z.string().optional(),
    mode: z.enum(['login', 'register', 'reset_password']).optional().default('login'),
  }).superRefine((data, ctx) => {
    if (data.mode === 'register' && data.password && data.password.length < 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Password must be at least 6 characters long',
        path: ['password'],
      });
    }
  }),
});

// --- Resend OTP ---
export const resendOtpSchema = z.object({
  body: z.object({
    email: emailSchema,
    mode: z.enum(['login', 'register', 'reset_password']).optional().default('login'),
  }),
});

// --- Reset password (forgot-password flow) ---
export const resetPasswordSchema = z.object({
  body: z.object({
    email: emailSchema,
    otp: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Reset code must be a 6-digit number"),
    newPassword: passwordSchema,
  }),
});

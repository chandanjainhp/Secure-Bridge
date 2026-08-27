import { PASSWORD_RESET_REQUEST_TEMPLATE, PASSWORD_RESET_SUCCESS_TEMPLATE, VERIFICATION_EMAIL_TEMPLATE } from "./emailTemplates.js";
import { transporter, sender } from "./email.config.js";

// Utility function to send emails
const sendEmail = async ({ to, subject, html, category, templateUuid, templateVariables }) => {
  const mailOptions = {
    from: `${sender.name} <${sender.email}>`,
    to: to,
    subject: subject,
    html: html,
  };

  try {
    const response = await transporter.sendMail(mailOptions);
    if (process.env.NODE_ENV === "development") console.log(`${category} email sent successfully`);
    return response;
  } catch (error) {
    console.error(`Error sending ${category} email`);
    throw new Error(`Failed to send ${category} email`);
  }
};

// Send OTP email for login/registration
export const sendOTPEmail = async (email, otp) => {
  return sendEmail({
    to: email,
    subject: "Your Secure Bridge verification code",
    html: VERIFICATION_EMAIL_TEMPLATE.replace("{verificationCode}", otp),
    category: "OTP Email",
  });
};

// Send verification email
export const sendVerificationEmail = async (email, verificationToken) => {
  return sendEmail({
    to: email,
    subject: "Verify your email",
    html: VERIFICATION_EMAIL_TEMPLATE.replace("{verificationCode}", verificationToken),
    category: "Email Verification",
  });
};

// Send welcome email
export const sendWelcomeEmail = async (email, name) => {
  return sendEmail({
    to: email,
    subject: "Welcome to Secure Bridge",
    html: `<h1>Welcome, ${name}!</h1><p>Your email has been verified successfully. You can now securely share and manage your healthcare data with Secure Bridge.</p>`,
    category: "Welcome Email",
  });
};

// Send password reset request email
export const sendPasswordResetEmail = async (email, verificationCode) => {
  // Send the email
  return sendEmail({
    to: email,
    subject: "Reset your password - Secure Bridge",
    html: PASSWORD_RESET_REQUEST_TEMPLATE.replace("{verificationCode}", verificationCode),
    category: "Password Reset Request"
  });
};


// Send password reset success email
export const sendResetSuccessEmail = async (email) => {
  return sendEmail({
    to: email,
    subject: "Password Reset Successful",
    html: PASSWORD_RESET_SUCCESS_TEMPLATE,
    category: "Password Reset Success",
  });
};

// Send subscription confirmation email for newsletter
export const sendSubscriptionEmail = async (email) => {
  return sendEmail({
    to: email,
    subject: 'Subscribed to Secure Bridge updates',
    html: `<h2>Thanks for subscribing to Secure Bridge updates</h2><p>You'll receive the latest security features, product releases, and privacy insights at <strong>${email}</strong>.</p>`,
    category: 'Subscription Confirmation'
  });
};


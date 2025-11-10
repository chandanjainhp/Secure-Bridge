import nodemailer from "nodemailer";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

console.log("Testing email configuration...");
console.log("EMAIL_USER:", process.env.EMAIL_USER);
console.log("EMAIL_PASS exists:", !!process.env.EMAIL_PASS);

// Create transporter
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  debug: true,
  logger: true
});

// Test the connection
console.log("\nTesting SMTP connection...");
transporter.verify(function (error, success) {
  if (error) {
    console.error("❌ SMTP Connection Error:", error);
  } else {
    console.log("✅ SMTP Server is ready to send emails");
    
    // Try sending a test email
    const mailOptions = {
      from: `Secure Bridge <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER, // Send to yourself for testing
      subject: "Test Email from Secure Bridge",
      html: "<h1>Test Email</h1><p>If you receive this, email service is working!</p>",
    };

    console.log("\nSending test email...");
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("❌ Email Send Error:", error);
      } else {
        console.log("✅ Email sent successfully!");
        console.log("Message ID:", info.messageId);
        console.log("Response:", info.response);
      }
    });
  }
});

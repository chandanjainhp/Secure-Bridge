import express from 'express';
import { sendSubscriptionEmail } from '../email/emails.js';

const router = express.Router();

// Simple email validation
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  return re.test(email);
};

router.post('/subscribe', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }

    // Send a confirmation email (non-blocking for user experience)
    try {
      await sendSubscriptionEmail(email);
    } catch (err) {
      console.error('Failed to send subscription email:', err);
      // don't fail the request if email sending has an issue; still respond success to avoid sign-up friction
    }

    // Optionally: Save subscription to DB or a mailing list here

    return res.json({ success: true, message: 'Subscribed successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;

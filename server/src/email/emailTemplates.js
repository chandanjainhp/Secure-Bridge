export const VERIFICATION_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Secure Bridge Account</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f6f9;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <div style="background-color: rgba(255,255,255,0.1); width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center;">
      <span style="font-size: 24px; color: white;">🔐</span>
    </div>
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">Secure Bridge</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 16px;">Privacy-First Communication</p>
  </div>
  
  <div style="background-color: white; padding: 40px 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <h2 style="color: #2d3748; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">Verify Your Account</h2>
    
    <p style="margin-bottom: 20px; font-size: 16px; color: #4a5568;">
      Welcome to Secure Bridge! You're one step away from accessing the most secure chat platform powered by homomorphic encryption.
    </p>
    
    <p style="margin-bottom: 30px; font-size: 16px; color: #4a5568;">
      Enter this verification code to complete your registration:
    </p>
    
    <div style="text-align: center; margin: 40px 0;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px; display: inline-block;">
        <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: white; font-family: 'Courier New', monospace;">{verificationCode}</span>
      </div>
    </div>
    
    <div style="background-color: #f7fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 30px 0;">
      <p style="margin: 0; font-size: 14px; color: #4a5568;">
        <strong>Security Note:</strong> This code expires in <strong>15 minutes</strong>. Your data will be encrypted end-to-end, ensuring complete privacy.
      </p>
    </div>
    
    <p style="font-size: 14px; color: #718096; margin: 20px 0 0 0;">
      If you didn't create a Secure Bridge account, please ignore this email. No account has been created.
    </p>
    
    <hr style="border: none; height: 1px; background-color: #e2e8f0; margin: 30px 0;">
    
    <p style="margin: 20px 0 0 0; font-size: 16px; color: #4a5568;">
      Best regards,<br>
      <strong style="color: #667eea;">The Secure Bridge Team</strong>
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 30px; color: #a0aec0; font-size: 12px;">
    <p>🔒 Your privacy is our priority | End-to-end encrypted communications</p>
    <p>This is an automated message. Please do not reply to this email.</p>
    <p style="margin-top: 15px;">
      <a href="#" style="color: #667eea; text-decoration: none;">Privacy Policy</a> | 
      <a href="#" style="color: #667eea; text-decoration: none;">Terms of Service</a>
    </p>
  </div>
</body>
</html>
`;

export const PASSWORD_RESET_REQUEST_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Secure Bridge Password</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f6f9;">
  <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <div style="background-color: rgba(255,255,255,0.1); width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center;">
      <span style="font-size: 24px; color: white;">🔑</span>
    </div>
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">Secure Bridge</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 16px;">Password Reset Request</p>
  </div>
  
  <div style="background-color: white; padding: 40px 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <h2 style="color: #2d3748; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">Reset Your Password</h2>
    
    <p style="margin-bottom: 20px; font-size: 16px; color: #4a5568;">
      We received a request to reset your Secure Bridge account password. If you didn't make this request, you can safely ignore this email.
    </p>
    
    <p style="margin-bottom: 30px; font-size: 16px; color: #4a5568;">
      To reset your password and regain access to your encrypted conversations, click the button below:
    </p>
    
    <div style="text-align: center; margin: 40px 0;">
      <a href="{resetURL}" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 15px rgba(240, 147, 251, 0.4); transition: transform 0.2s;">
        Reset My Password 🔐
      </a>
    </div>
    
    <div style="background-color: #fff5f5; padding: 20px; border-radius: 8px; border-left: 4px solid #f56565; margin: 30px 0;">
      <p style="margin: 0; font-size: 14px; color: #742a2a;">
        <strong>Security Alert:</strong> This reset link expires in <strong>1 hour</strong>. After reset, you'll need to re-establish encryption keys for your conversations.
      </p>
    </div>
    
    <p style="font-size: 14px; color: #718096; margin: 20px 0;">
      If the button doesn't work, copy and paste this URL into your browser:
    </p>
    <p style="font-size: 12px; color: #a0aec0; word-break: break-all; background-color: #f7fafc; padding: 10px; border-radius: 4px; font-family: 'Courier New', monospace;">
      {resetURL}
    </p>
    
    <hr style="border: none; height: 1px; background-color: #e2e8f0; margin: 30px 0;">
    
    <p style="margin: 20px 0 0 0; font-size: 16px; color: #4a5568;">
      Stay secure,<br>
      <strong style="color: #f093fb;">The Secure Bridge Team</strong>
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 30px; color: #a0aec0; font-size: 12px;">
    <p>🔒 Your privacy is our priority | End-to-end encrypted communications</p>
    <p>This is an automated message. Please do not reply to this email.</p>
    <p style="margin-top: 15px;">
      <a href="#" style="color: #f093fb; text-decoration: none;">Security Center</a> | 
      <a href="#" style="color: #f093fb; text-decoration: none;">Contact Support</a>
    </p>
  </div>
</body>
</html>
`;

export const PASSWORD_RESET_SUCCESS_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Successful - Secure Bridge</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f6f9;">
  <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <div style="background-color: rgba(255,255,255,0.1); width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center;">
      <span style="font-size: 24px; color: white;">✓</span>
    </div>
    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">Secure Bridge</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 16px;">Password Updated Successfully</p>
  </div>
  
  <div style="background-color: white; padding: 40px 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <h2 style="color: #2d3748; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">Password Reset Complete!</h2>
    
    <p style="margin-bottom: 20px; font-size: 16px; color: #4a5568;">
      Great news! Your Secure Bridge account password has been successfully reset. Your account security has been restored.
    </p>
    
    <div style="text-align: center; margin: 40px 0;">
      <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); width: 80px; height: 80px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 8px 25px rgba(79, 172, 254, 0.3);">
        <span style="color: white; font-size: 40px; font-weight: bold;">✓</span>
      </div>
    </div>
    
    <div style="background-color: #f0fff4; padding: 20px; border-radius: 8px; border-left: 4px solid #48bb78; margin: 30px 0;">
      <p style="margin: 0 0 15px 0; font-size: 16px; color: #276749; font-weight: 600;">
        Your account is now secure and ready to use!
      </p>
      <p style="margin: 0; font-size: 14px; color: #2f855a;">
        You can now log in with your new password and continue your encrypted conversations.
      </p>
    </div>
    
    <div style="background-color: #fffaf0; padding: 20px; border-radius: 8px; border-left: 4px solid #ed8936; margin: 30px 0;">
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #744210; font-weight: 600;">
        Security Reminder:
      </p>
      <p style="margin: 0; font-size: 14px; color: #744210;">
        If you didn't initiate this password reset, please contact our security team immediately at security@securebridge.com
      </p>
    </div>
    
    <h3 style="color: #2d3748; font-size: 18px; margin: 30px 0 15px 0;">Security Best Practices:</h3>
    <ul style="color: #4a5568; font-size: 14px; margin: 0; padding-left: 20px;">
      <li style="margin-bottom: 8px;">Use a strong, unique password that you don't use elsewhere</li>
      <li style="margin-bottom: 8px;">Enable two-factor authentication for additional security</li>
      <li style="margin-bottom: 8px;">Keep your recovery information up to date</li>
      <li style="margin-bottom: 8px;">Never share your login credentials with anyone</li>
    </ul>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="#" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
        Access Secure Bridge →
      </a>
    </div>
    
    <hr style="border: none; height: 1px; background-color: #e2e8f0; margin: 30px 0;">
    
    <p style="margin: 20px 0 0 0; font-size: 16px; color: #4a5568;">
      Thank you for keeping your account secure,<br>
      <strong style="color: #4facfe;">The Secure Bridge Team</strong>
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 30px; color: #a0aec0; font-size: 12px;">
    <p>🔒 Your privacy is our priority | End-to-end encrypted communications</p>
    <p>This is an automated message. Please do not reply to this email.</p>
    <p style="margin-top: 15px;">
      <a href="#" style="color: #4facfe; text-decoration: none;">Security Center</a> | 
      <a href="#" style="color: #4facfe; text-decoration: none;">Account Settings</a> | 
      <a href="#" style="color: #4facfe; text-decoration: none;">Contact Support</a>
    </p>
  </div>
</body>
</html>
`;

export const WELCOME_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Secure Bridge</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f6f9;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
    <div style="background-color: rgba(255,255,255,0.1); width: 80px; height: 80px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
      <span style="font-size: 32px; color: white;">🚀</span>
    </div>
    <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 600;">Welcome to Secure Bridge!</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 18px;">The future of private communication is here</p>
  </div>
  
  <div style="background-color: white; padding: 40px 30px; border-radius: 0 0 8px 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
    <h2 style="color: #2d3748; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">Your account is ready!</h2>
    
    <p style="margin-bottom: 30px; font-size: 16px; color: #4a5568;">
      Congratulations! You're now part of the Secure Bridge community, where every message is protected by cutting-edge homomorphic encryption technology.
    </p>
    
    <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 30%, #4facfe 70%, #00f2fe 100%); padding: 25px; border-radius: 12px; margin: 30px 0;">
      <h3 style="color: white; margin: 0 0 15px 0; font-size: 20px; text-align: center;">🔐 What makes us different?</h3>
      <div style="background-color: rgba(255,255,255,0.1); padding: 20px; border-radius: 8px;">
        <p style="color: white; margin: 0; font-size: 14px; text-align: center;">
          Your messages are encrypted on your device and stay encrypted everywhere - even our AI can process them without ever seeing the content!
        </p>
      </div>
    </div>
    
    <h3 style="color: #2d3748; font-size: 20px; margin: 30px 0 20px 0;">Getting Started:</h3>
    
    <div style="margin: 20px 0;">
      <div style="display: flex; align-items: flex-start; margin-bottom: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px; flex-shrink: 0;">
          <span style="color: white; font-weight: bold; font-size: 14px;">1</span>
        </div>
        <div>
          <h4 style="margin: 0 0 5px 0; color: #2d3748; font-size: 16px;">Complete Your Profile</h4>
          <p style="margin: 0; color: #4a5568; font-size: 14px;">Set up your display name and avatar to personalize your experience.</p>
        </div>
      </div>
      
      <div style="display: flex; align-items: flex-start; margin-bottom: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px; flex-shrink: 0;">
          <span style="color: white; font-weight: bold; font-size: 14px;">2</span>
        </div>
        <div>
          <h4 style="margin: 0 0 5px 0; color: #2d3748; font-size: 16px;">Start Your First Conversation</h4>
          <p style="margin: 0; color: #4a5568; font-size: 14px;">Create a new chat or join an existing one - all messages are automatically encrypted.</p>
        </div>
      </div>
      
      <div style="display: flex; align-items: flex-start; margin-bottom: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px; flex-shrink: 0;">
          <span style="color: white; font-weight: bold; font-size: 14px;">3</span>
        </div>
        <div>
          <h4 style="margin: 0 0 5px 0; color: #2d3748; font-size: 16px;">Experience AI-Powered Features</h4>
          <p style="margin: 0; color: #4a5568; font-size: 14px;">Try our intelligent features that work on encrypted data without compromising privacy.</p>
        </div>
      </div>
    </div>
    
    <div style="text-align: center; margin: 40px 0;">
      <a href="{loginURL}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
        Start Chatting Securely 🚀
      </a>
    </div>
    
    <div style="background-color: #f7fafc; padding: 25px; border-radius: 8px; border-left: 4px solid #667eea; margin: 30px 0;">
      <h4 style="margin: 0 0 10px 0; color: #2d3748; font-size: 16px;">Need Help?</h4>
      <p style="margin: 0 0 15px 0; font-size: 14px; color: #4a5568;">
        Check out our comprehensive guides and documentation:
      </p>
      <div style="margin-top: 15px;">
        <a href="#" style="color: #667eea; text-decoration: none; font-size: 14px; margin-right: 20px;">📚 User Guide</a>
        <a href="#" style="color: #667eea; text-decoration: none; font-size: 14px; margin-right: 20px;">🔒 Security FAQ</a>
        <a href="#" style="color: #667eea; text-decoration: none; font-size: 14px;">💬 Support</a>
      </div>
    </div>
    
    <hr style="border: none; height: 1px; background-color: #e2e8f0; margin: 30px 0;">
    
    <p style="margin: 20px 0 0 0; font-size: 16px; color: #4a5568;">
      Welcome to the future of secure communication,<br>
      <strong style="color: #667eea;">The Secure Bridge Team</strong>
    </p>
  </div>
  
  <div style="text-align: center; margin-top: 30px; color: #a0aec0; font-size: 12px;">
    <p>🔒 Your privacy is our priority | End-to-end encrypted communications</p>
    <p>This is an automated message. Please do not reply to this email.</p>
    <p style="margin-top: 15px;">
      <a href="#" style="color: #667eea; text-decoration: none;">Privacy Policy</a> | 
      <a href="#" style="color: #667eea; text-decoration: none;">Terms of Service</a> | 
      <a href="#" style="color: #667eea; text-decoration: none;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>
`;
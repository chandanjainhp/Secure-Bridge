// Test script to verify Gmail connection for Secure Bridge
import { sendVerificationEmail, sendWelcomeEmail } from './emails.js';

const testGmailConnection = async () => {
    console.log('🚀 Testing Gmail connection for Secure Bridge...\n');
    
    try {
        // Test verification email
        console.log('📧 Sending test verification email...');
        const testCode = '123456';
        await sendVerificationEmail('chandanjaincj93@gmail.com', testCode);
        console.log('✅ Verification email sent successfully!\n');
        
        // Test welcome email
        console.log('📧 Sending test welcome email...');
        await sendWelcomeEmail('chandanjaincj93@gmail.com', 'Test User');
        console.log('✅ Welcome email sent successfully!\n');
        
        console.log('🎉 All email tests passed! Gmail is connected properly.');
        
    } catch (error) {
        console.error('❌ Email test failed:', error.message);
        console.error('Full error:', error);
    }
};

// Run the test
testGmailConnection()
    .then(() => {
        console.log('\n📋 Test completed. Check the recipient email for the test messages.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Unexpected error during test:', error);
        process.exit(1);
    });

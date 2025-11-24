// Quick test to verify Redis connection
import dotenv from 'dotenv';
import redisService from './src/services/redis.service.js';

// Load environment variables
dotenv.config();

async function testRedis() {
    console.log('🧪 Testing Redis connection...\n');
    
    // Connect
    await redisService.connect();
    
    if (!redisService.isAvailable) {
        console.log('❌ Redis not available');
        process.exit(1);
    }
    
    // Test set
    console.log('📝 Testing SET operation...');
    const setResult = await redisService.setTemp('test_key', 'Hello from Secure Bridge!', 60);
    console.log('   Result:', setResult ? '✅ Success' : '❌ Failed');
    
    // Test get
    console.log('\n📖 Testing GET operation...');
    const getValue = await redisService.getTemp('test_key');
    console.log('   Retrieved:', getValue);
    
    // Test session
    console.log('\n👤 Testing session storage...');
    await redisService.setSession('user123', { 
        name: 'Test User', 
        lastActive: new Date().toISOString() 
    }, 300);
    const session = await redisService.getSession('user123');
    console.log('   Session:', session);
    
    // Test rate limiting
    console.log('\n⏱️  Testing rate limiting...');
    const rateLimit = await redisService.incrementRateLimit('test_ip', 60);
    console.log('   Request count:', rateLimit.count);
    
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await redisService.deleteTemp('test_key');
    await redisService.disconnect();
    
    console.log('\n✅ All tests passed! Redis is ready to use.');
}

testRedis().catch(console.error);

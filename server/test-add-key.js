import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Connect to MongoDB
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/secure-bridge');
console.log('✅ Connected to MongoDB\n');

// Get User model
const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const User = mongoose.model('User', UserSchema);

// Find users
const users = await User.find({});
if (users.length === 0) {
  console.log('❌ No users found in database. Please register a user first.');
  await mongoose.disconnect();
  rl.close();
  process.exit(1);
}

console.log('👥 Available users:');
users.forEach((user, index) => {
  console.log(`  [${index + 1}] ${user.username || user.email} (ID: ${user._id})`);
});

const userIndex = await question('\nSelect user number: ');
const selectedUser = users[parseInt(userIndex) - 1];

if (!selectedUser) {
  console.log('❌ Invalid user selection');
  await mongoose.disconnect();
  rl.close();
  process.exit(1);
}

console.log(`\n✅ Selected user: ${selectedUser.username || selectedUser.email}\n`);

// Get API key details
console.log('Available providers:');
console.log('  1. openai (for GPT models)');
console.log('  2. anthropic (for Claude models)');
console.log('  3. google (for Gemini models)');
console.log('  4. google_ai_studio (for Google AI Studio)');

const providerChoice = await question('\nSelect provider number: ');
const providers = ['openai', 'anthropic', 'google', 'google_ai_studio'];
const provider = providers[parseInt(providerChoice) - 1];

if (!provider) {
  console.log('❌ Invalid provider selection');
  await mongoose.disconnect();
  rl.close();
  process.exit(1);
}

const apiKeyValue = await question(`\nEnter your ${provider} API key: `);

if (!apiKeyValue || apiKeyValue.length < 10) {
  console.log('❌ Invalid API key');
  await mongoose.disconnect();
  rl.close();
  process.exit(1);
}

// Import the ApiKeyService
const { default: ApiKeyService } = await import('./src/services/apiKeyService.js');

try {
  console.log('\n📝 Creating API key...');
  
  const keyData = {
    name: `${provider.toUpperCase()} API Key - Manual Test`,
    description: `Manually added ${provider} API key for testing`,
    permissions: ['chat.access', 'chat.completions'],
    rateLimit: {
      requestsPerMinute: 100,
      requestsPerHour: 1000,
      requestsPerDay: 10000
    },
    externalKey: apiKeyValue,
    provider: provider
  };

  const result = await ApiKeyService.createApiKey(selectedUser._id, keyData);
  
  console.log('\n✅ API Key created successfully!');
  console.log('Details:', {
    id: result._id,
    name: result.name,
    provider: result.provider || result.externalProvider,
    permissions: result.permissions,
    status: result.status
  });
  
} catch (error) {
  console.error('\n❌ Error creating API key:', error.message);
}

await mongoose.disconnect();
rl.close();
console.log('\n✅ Disconnected from MongoDB\n');

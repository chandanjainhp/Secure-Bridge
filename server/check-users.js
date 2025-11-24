import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/secure-bridge');

const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const User = mongoose.model('User', UserSchema);

const users = await User.find({});
console.log('\n👥 Total users:', users.length);

if (users.length > 0) {
  console.log('\nUsers:');
  users.forEach(user => {
    console.log(`  - ${user.username || user.email} (ID: ${user._id}, Created: ${user.createdAt})`);
  });
} else {
  console.log('\n❌ NO USERS FOUND!');
  console.log('\nYou need to register a user first:');
  console.log('  1. Go to http://localhost:5173 (frontend)');
  console.log('  2. Click "Register" or "Sign Up"');
  console.log('  3. Create an account');
  console.log('  4. Then come back and add your API keys');
}

await mongoose.disconnect();

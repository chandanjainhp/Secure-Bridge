// ES Module setup file - runs BEFORE any test files are imported
// This allows us to configure Mongoose before any models are loaded

import mongoose from 'mongoose';

// Set buffer timeout to 30 seconds - MUST happen before any model imports
console.log('[SETUP-MONGOOSE] Setting bufferTimeoutMS to 30000');
mongoose.set('bufferTimeoutMS', 30000);
console.log('[SETUP-MONGOOSE] bufferTimeoutMS is now:', mongoose.get('bufferTimeoutMS'));

// Also set bufferCommands to false to prevent buffering entirely
mongoose.set('bufferCommands', false);
console.log('[SETUP-MONGOOSE] bufferCommands is now:', mongoose.get('bufferCommands'));

export default mongoose;

import fetch from 'node-fetch';

const API_KEY = 'AIzaSyCcG6EYzYIBN0-Dv_d0Eg89KKNMJpzCxE4';

console.log('🔍 Fetching available Google AI models...\n');

// List all models
const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

try {
  const response = await fetch(listUrl);
  
  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Error:', response.status, error);
    process.exit(1);
  }
  
  const data = await response.json();
  
  console.log(`✅ Found ${data.models?.length || 0} models\n`);
  
  // Filter models that support generateContent
  const contentModels = data.models?.filter(model => 
    model.supportedGenerationMethods?.includes('generateContent')
  ) || [];
  
  console.log(`📝 Models supporting generateContent (${contentModels.length}):\n`);
  
  contentModels.forEach(model => {
    console.log(`  ✅ ${model.name}`);
    console.log(`     Display Name: ${model.displayName}`);
    console.log(`     Description: ${model.description}`);
    console.log(`     Methods: ${model.supportedGenerationMethods?.join(', ')}`);
    console.log('');
  });
  
  // Test with gemini-2.0-flash as shown in your curl example
  console.log('\n🧪 Testing gemini-2.0-flash model...\n');
  
  const testUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
  
  const testResponse = await fetch(testUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: 'Say hello in one word'
        }]
      }]
    })
  });
  
  if (testResponse.ok) {
    const result = await testResponse.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('✅ gemini-2.0-flash works! Response:', text);
  } else {
    const error = await testResponse.text();
    console.log('❌ gemini-2.0-flash failed:', testResponse.status, error);
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
}

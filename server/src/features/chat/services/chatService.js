import UserApiKey from '../../api-key/models/userApiKey.model.js';
import UserUsage from '../../usage/models/userUsage.model.js';
import { Project } from '../../../models/project.model.js'; // Path to project model
import { decryptApiKey } from '../../api-key/services/apiKeyService.js';
import axios from 'axios';

// Shared API key for free tier (should be in environment variable)
const SHARED_OPENAI_API_KEY = process.env.SHARED_OPENAI_API_KEY;
if (!SHARED_OPENAI_API_KEY) {
  throw new Error('SHARED_OPENAI_API_KEY is not set in environment variables');
}

// Function to make a chat completion request to OpenAI
async function callOpenAIApi(apiKey, messages, model = 'gpt-3.5-turbo', temperature = 0.7, maxTokens = 1000) {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 seconds timeout
    }
  );

  return response.data;
}

const chatService = {
  // Send a chat message
  async sendMessage(userId, projectId, conversationId, content) {
    // Step 1: Get the project to verify ownership and get model/settings
    const project = await Project.findOne({ 
      _id: projectId, 
      owner: userId  // Assuming owner is stored as ObjectId referencing User
    });
    
    if (!project) {
      throw new Error('Project not found or access denied');
    }

    // Step 2: Find the conversation within the project's conversations
    const conversation = project.conversations.find(c => c.id === conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Step 3: Get the conversation messages history
    const conversationMessages = conversation.messages || [];

    // Step 4: Check if the user has an API key
    const userApiKey = await UserApiKey.findOne({ userId });
    let apiKeyToUse;
    let isUsingSharedKey = false;

    if (userApiKey) {
      // Decrypt the user's API key
      const encrypted = JSON.parse(userApiKey.encryptedKey);
      apiKeyToUse = decryptApiKey(encrypted);
    } else {
      // Use the shared key
      apiKeyToUse = SHARED_OPENAI_API_KEY;
      isUsingSharedKey = true;
    }

    // Step 5: If using shared key, check the free message limit
    if (isUsingSharedKey) {
      const usage = await UserUsage.findOne({ userId });
      const freeMessagesUsed = usage ? usage.freeMessagesUsed : 0;
      if (freeMessagesUsed >= 10) {
        // Free limit reached
        const error = new Error('Free limit reached');
        error.code = 'FREE_LIMIT_REACHED';
        throw error;
      }
    }

    // Step 6: Prepare messages array for OpenAI API
    // Add the new user message to the conversation history
    const messages = [
      ...conversationMessages,
      { role: 'user', content: content }
    ];

    // Step 7: Get model and settings from project (with fallbacks)
    const model = project.model || 'gpt-3.5-turbo';
    const temperature = project.temperature !== undefined ? project.temperature : 0.7;
    const maxTokens = project.maxTokens !== undefined ? project.maxTokens : 1000;

    // Step 8: Make the API call
    let response;
    try {
      response = await callOpenAIApi(apiKeyToUse, messages, model, temperature, maxTokens);
    } catch (error) {
      // If the user's key is invalid, throw an error
      if (!isUsingSharedKey && error.response && error.response.status === 401) {
        const err = new Error('Invalid API key');
        err.code = 'INVALID_API_KEY';
        throw err;
      }
      throw error; // Re-throw other errors (e.g., network error, rate limit, etc.)
    }

    // Step 9: If we used the shared key, increment the usage
    if (isUsingSharedKey) {
      const usage = await UserUsage.findOne({ userId });
      if (!usage) {
        await UserUsage.create({ userId, freeMessagesUsed: 1 });
      } else {
        usage.freeMessagesUsed += 1;
        await usage.save();
      }
    }

    // Step 10: Update the conversation with the assistant's response
    const assistantMessage = response.choices[0].message;
    const newMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role: assistantMessage.role,
      content: assistantMessage.content,
      createdAt: new Date()
    };
    
    // Add the assistant's message to the conversation
    conversation.messages.push(newMessage);
    
    // Save the project to persist the updated conversation
    await project.save();

    // Step 11: Return the response
    return response;
  },
};

export default chatService;
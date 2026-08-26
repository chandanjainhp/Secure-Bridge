import chatService from '../services/chatService.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const chatController = {
  // Send a chat message
  sendMessage: asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { projectId, conversationId, content } = req.body;

    if (!projectId || !conversationId || !content) {
      return res.status(400).json({ error: 'Project ID, conversation ID, and content are required' });
    }

    const response = await chatService.sendMessage(
      userId,
      projectId,
      conversationId,
      content
    );

    // Extract the assistant's message from the response
    const assistantMessage = response.choices[0].message;
    res.status(200).json(assistantMessage);
  }),
};

export default chatController;
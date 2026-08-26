const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticate } = require('../../../middleware/authenticate');

// All routes require authentication
router.use(authenticate);

router.post('/', chatController.sendMessage);

module.exports = router;
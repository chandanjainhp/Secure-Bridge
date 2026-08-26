import express from 'express';
const router = express.Router();
import apiKeyController from '../features/api-key/controllers/apiKeyController.js';
import { verifyJWT } from '../middlewares/auth.middle.js'; // Assuming we have an auth middleware that verifies JWT

// All routes require authentication (JWT)
router.use(verifyJWT);

router.post('/', apiKeyController.saveApiKey);
router.get('/', apiKeyController.getApiKey);
router.delete('/', apiKeyController.deleteApiKey);

export default router;
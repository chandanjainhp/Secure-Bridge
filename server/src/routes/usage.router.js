import express from 'express';
const router = express.Router();
import usageController from '../features/usage/controllers/usageController.js';
import { verifyJWT } from '../middlewares/auth.middle.js';

// All routes require authentication (JWT)
router.use(verifyJWT);

router.get('/', usageController.getUsage);

export default router;
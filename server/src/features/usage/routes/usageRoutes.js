import { Router } from 'express';
import usageController from '../controllers/usageController.js';
import { verifyJWT } from '../../../middlewares/auth.middle.js';
const router = Router();
router.get('/', verifyJWT, usageController.getUsage);
export default router;

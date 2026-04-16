import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import * as dashboardController from '../controllers/dashboard.controller';

const router = Router();

router.use(authenticate);
router.get('/stats', dashboardController.getStats);

export default router;

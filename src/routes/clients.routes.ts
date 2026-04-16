import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import * as clientController from '../controllers/client.controller';

const router = Router();

router.use(authenticate);

router.get('/', clientController.index);
router.get('/:id', clientController.show);
router.post('/:id/send-email', clientController.sendEmail);
router.post('/', clientController.create);
router.put('/:id', clientController.update);
router.delete('/:id', clientController.destroy);

export default router;

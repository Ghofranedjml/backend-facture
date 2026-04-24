import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import * as quotationController from '../controllers/quotation.controller';

const router = Router();

router.use(authenticate);

router.get('/', quotationController.index);
router.get('/:id', quotationController.show);
router.post('/', quotationController.create);
router.put('/:id', quotationController.update);
router.delete('/:id', quotationController.destroy);
router.post('/:id/send', quotationController.send);
router.post('/:id/accept', quotationController.accept);
router.post('/:id/refuse', quotationController.refuse);
router.post('/:id/convert', quotationController.convert);

export default router;

import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import * as invoiceController from '../controllers/invoice.controller';
import * as pdfController from '../controllers/pdf.controller';

const router = Router();

// Toutes les routes nécessitent un JWT valide
router.use(authenticate);

// ── Stats — AVANT /:id pour éviter le conflit de routing ──
router.get('/stats', invoiceController.stats);

// ── CRUD ──────────────────────────────────────────────────
router.get('/', invoiceController.index);
router.get('/:id', invoiceController.show);
router.get('/:id/analyze', invoiceController.analyze);
router.get('/:id/validate-taxes', invoiceController.validateTaxes);
router.post('/', invoiceController.create);
router.put('/:id', invoiceController.update);
router.delete('/:id', invoiceController.destroy);

// ── Transitions d'état (machine d'états) ──────────────────
router.post('/:id/validate', invoiceController.validate);
router.post('/:id/pay', invoiceController.pay);
router.post('/:id/cancel', invoiceController.cancel);

// ── PDF & Email ────────────────────────────────────────────
router.get('/:id/pdf', pdfController.downloadPdf);
router.post('/:id/send', pdfController.sendEmail);

export default router;

import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import * as invoiceController from '../controllers/invoice.controller';

const router = Router();

// Toutes les routes nécessitent un JWT valide
router.use(authenticate);

// ── Stats — AVANT /:id pour éviter le conflit de routing ──
router.get('/stats', invoiceController.stats);

// ── CRUD ──────────────────────────────────────────────────
router.get('/', invoiceController.index);
router.get('/:id', invoiceController.show);
router.post('/', invoiceController.create);
router.put('/:id', invoiceController.update);
router.delete('/:id', invoiceController.destroy);

// ── Transitions d'état (machine d'états) ──────────────────
router.post('/:id/validate', invoiceController.validate);
router.post('/:id/pay', invoiceController.pay);
router.post('/:id/cancel', invoiceController.cancel);

// ── PDF & Email — placeholders (Sprint 8 & 9) ─────────────
router.get('/:id/pdf', authenticate, (_req, res) => {
  res.status(501).json({
    success: false,
    error: { code: 'NOT_IMPLEMENTED', message: 'PDF — disponible au Sprint 8 (13 avr)' },
  });
});

router.post('/:id/send', authenticate, (_req, res) => {
  res.status(501).json({
    success: false,
    error: { code: 'NOT_IMPLEMENTED', message: 'Envoi email — disponible au Sprint 9' },
  });
});

export default router;

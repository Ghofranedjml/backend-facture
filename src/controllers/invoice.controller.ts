import { Request, Response, NextFunction } from 'express';
import * as invoiceService from '../services/invoice.service';
import {
  createInvoiceSchema,
  updateInvoiceSchema,
  markPaidSchema,
  invoiceQuerySchema,
} from '../utils/validators';

// GET /api/invoices
export async function index(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = invoiceQuerySchema.parse(req.query);
    const { invoices, meta } = await invoiceService.listInvoices(req.user!.userId, query);

    res.json({ success: true, data: invoices, meta });
  } catch (err) {
    next(err);
  }
}

// GET /api/invoices/stats
export async function stats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await invoiceService.getInvoiceStats(req.user!.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// GET /api/invoices/:id
export async function show(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const invoice = await invoiceService.getInvoice(req.params.id, req.user!.userId);
    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
}

// POST /api/invoices
export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createInvoiceSchema.parse(req.body);
    const invoice = await invoiceService.createInvoice(req.user!.userId, input);
    res.status(201).json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
}

// PUT /api/invoices/:id
export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = updateInvoiceSchema.parse(req.body);
    const invoice = await invoiceService.updateInvoice(req.params.id, req.user!.userId, input);
    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/invoices/:id
export async function destroy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await invoiceService.deleteInvoice(req.params.id, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// POST /api/invoices/:id/validate
export async function validate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const invoice = await invoiceService.validateInvoice(req.params.id, req.user!.userId);
    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
}

// POST /api/invoices/:id/pay
export async function pay(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = markPaidSchema.parse(req.body);
    const invoice = await invoiceService.markInvoicePaid(req.params.id, req.user!.userId, input);
    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
}

// POST /api/invoices/:id/cancel
export async function cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const invoice = await invoiceService.cancelInvoice(req.params.id, req.user!.userId);
    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
}

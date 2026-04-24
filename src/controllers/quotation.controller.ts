import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import * as quotationService from '../services/quotation.service';
import {
  convertQuotationSchema,
  createQuotationSchema,
  quotationQuerySchema,
  updateQuotationSchema,
} from '../utils/validators';

// validation for req.params.id to ensure it's a valid CUID before passing to service
const idParamSchema = z.object({
  id: z.string().cuid('ID de devis invalide'),
});

// GET /api/quotations
export async function index(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = quotationQuerySchema.parse(req.query);
    const { quotations, meta } = await quotationService.listQuotations(req.user!.userId, query);
    res.json({ success: true, data: quotations, meta });
  } catch (err) {
    next(err);
  }
}

// GET /api/quotations/:id
export async function show(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // ─── Add this line ───
    const { id } = idParamSchema.parse(req.params);
    
    const quotation = await quotationService.getQuotation(id, req.user!.userId);
    res.json({ success: true, data: quotation });
  } catch (err) {
    next(err);
  }
}

// POST /api/quotations
export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createQuotationSchema.parse(req.body);
    const quotation = await quotationService.createQuotation(req.user!.userId, input);
    res.status(201).json({ success: true, data: quotation });
  } catch (err) {
    next(err);
  }
}

// PUT /api/quotations/:id
export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // ─── Add this line ───
    const { id } = idParamSchema.parse(req.params);
    
    const input = updateQuotationSchema.parse(req.body);
    const quotation = await quotationService.updateQuotation(id, req.user!.userId, input);
    res.json({ success: true, data: quotation });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/quotations/:id
export async function destroy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // ─── Add this line ───
    const { id } = idParamSchema.parse(req.params);
    
    await quotationService.deleteQuotation(id, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// POST /api/quotations/:id/send
export async function send(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // ─── Add this line ───
    const { id } = idParamSchema.parse(req.params);
    
    const quotation = await quotationService.sendQuotation(id, req.user!.userId);
    res.json({ success: true, data: quotation });
  } catch (err) {
    next(err);
  }
}

// POST /api/quotations/:id/accept
export async function accept(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // ─── Add this line ───
    const { id } = idParamSchema.parse(req.params);
    
    const quotation = await quotationService.acceptQuotation(id, req.user!.userId);
    res.json({ success: true, data: quotation });
  } catch (err) {
    next(err);
  }
}

// POST /api/quotations/:id/refuse
export async function refuse(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // ─── Add this line ───
    const { id } = idParamSchema.parse(req.params);
    
    const quotation = await quotationService.refuseQuotation(id, req.user!.userId);
    res.json({ success: true, data: quotation });
  } catch (err) {
    next(err);
  }
}

// POST /api/quotations/:id/convert
export async function convert(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // ─── Add this line ───
    const { id } = idParamSchema.parse(req.params);
    
    const input = convertQuotationSchema.parse(req.body);
    const invoice = await quotationService.convertQuotationToInvoice(id, req.user!.userId, input);
    res.json({ success: true, data: invoice });
  } catch (err) {
    next(err);
  }
}
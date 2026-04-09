import { Request, Response, NextFunction } from 'express';
import { generateInvoicePdf } from '../services/pdf.service';
import { sendInvoiceByEmail } from '../services/email.service';

// GET /api/invoices/:id/pdf
export async function downloadPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const start = Date.now();
    const pdfBuffer = await generateInvoicePdf(req.params.id, req.user!.userId);
    const elapsed = Date.now() - start;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="facture-${req.params.id}.pdf"`);
    res.setHeader('X-Generation-Time-Ms', String(elapsed));
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

// POST /api/invoices/:id/send
export async function sendEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await sendInvoiceByEmail(req.params.id, req.user!.userId);
    res.json({ success: true, data: { message: 'Email envoyé avec succès' } });
  } catch (err) {
    next(err);
  }
}

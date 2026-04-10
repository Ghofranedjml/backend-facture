import { NextFunction, Request, Response } from 'express';
import { getDashboardStats } from '../services/dashboard.service';

export async function stats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await getDashboardStats(req.user!.userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

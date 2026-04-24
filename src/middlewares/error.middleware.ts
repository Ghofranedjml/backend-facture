import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Erreur métier connue
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
    return;
  }

  // Erreur de validation Zod
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Données invalides',
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  // Erreur Prisma — conflit d'unicité
  if ((err as { code?: string }).code === 'P2002') {
    res.status(409).json({
      success: false,
      error: { code: 'CONFLICT', message: 'Cette ressource existe déjà' },
    });
    return;
  }

  // Erreur Prisma — entité introuvable
  if ((err as { code?: string }).code === 'P2025') {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Ressource introuvable' },
    });
    return;
  }

  logger.error('Unhandled error', { error: err.message, stack: err.stack });

  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur' },
  });
}

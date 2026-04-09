import { Request, Response, NextFunction } from 'express';
import * as clientService from '../services/client.service';
import { createClientSchema, updateClientSchema } from '../utils/validators';

// GET /api/clients
export async function index(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const clients = await clientService.listClients(req.user!.userId, search);
    res.json({ success: true, data: clients });
  } catch (err) {
    next(err);
  }
}

// GET /api/clients/:id
export async function show(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const client = await clientService.getClient(req.params.id, req.user!.userId);
    res.json({ success: true, data: client });
  } catch (err) {
    next(err);
  }
}

// POST /api/clients
export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createClientSchema.parse(req.body);
    const client = await clientService.createClient(req.user!.userId, input);
    res.status(201).json({ success: true, data: client });
  } catch (err) {
    next(err);
  }
}

// PUT /api/clients/:id
export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = updateClientSchema.parse(req.body);
    const client = await clientService.updateClient(req.params.id, req.user!.userId, input);
    res.json({ success: true, data: client });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/clients/:id
export async function destroy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await clientService.deleteClient(req.params.id, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

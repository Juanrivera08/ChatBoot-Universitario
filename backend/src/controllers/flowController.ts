import { Request, Response, NextFunction } from 'express';
import { flowService } from '../services/flowService';
import { AppError } from '../middleware/errorHandler';

export async function getFlows(_req: Request, res: Response, next: NextFunction) {
  try {
    const flows = await flowService.getAllFlows();
    res.json({ flows });
  } catch (e) { next(e); }
}

export async function getFlow(req: Request, res: Response, next: NextFunction) {
  try {
    const flow = await flowService.getFlowWithSteps(req.params.id);
    if (!flow) return next(new AppError('Flujo no encontrado', 404));
    res.json({ flow });
  } catch (e) { next(e); }
}

export async function createFlow(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, description, triggerKeywords, completionMessage, notificationEmail } = req.body;
    if (!name || !triggerKeywords?.length) {
      return next(new AppError('Nombre y palabras clave son requeridos', 400));
    }
    const flow = await flowService.createFlow({
      name, description, triggerKeywords, completionMessage, notificationEmail,
    });
    res.status(201).json({ flow });
  } catch (e) { next(e); }
}

export async function addStep(req: Request, res: Response, next: NextFunction) {
  try {
    const step = await flowService.addStep(req.params.id, req.body);
    res.status(201).json({ step });
  } catch (e) { next(e); }
}

export async function deleteFlow(req: Request, res: Response, next: NextFunction) {
  try {
    await flowService.deleteFlow(req.params.id);
    res.json({ message: 'Flujo eliminado' });
  } catch (e) { next(e); }
}

export async function toggleFlow(req: Request, res: Response, next: NextFunction) {
  try {
    await flowService.toggleFlow(req.params.id, req.body.isActive);
    res.json({ message: 'Estado actualizado' });
  } catch (e) { next(e); }
}

export async function getSubmissions(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const status = req.query.status as string | undefined;
    const result = await flowService.getSubmissions(page, 20, status);
    res.json(result);
  } catch (e) { next(e); }
}

export async function updateSubmission(req: Request, res: Response, next: NextFunction) {
  try {
    const { status, notes } = req.body;
    const ALLOWED_STATUSES = ['pendiente', 'en_proceso', 'completado', 'rechazado'];
    if (!ALLOWED_STATUSES.includes(status)) {
      return next(new AppError(`Estado inválido. Valores permitidos: ${ALLOWED_STATUSES.join(', ')}`, 400));
    }
    await flowService.updateSubmissionStatus(req.params.id, status, notes);
    res.json({ message: 'Solicitud actualizada' });
  } catch (e) { next(e); }
}

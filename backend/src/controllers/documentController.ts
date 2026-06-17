import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { documentService } from '../services/documentService';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export async function uploadDocument(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(errors.array()[0].msg, 400));
    }

    if (!req.file) {
      return next(new AppError('No se recibió ningún archivo', 400));
    }

    const { title, category, description } = req.body;
    const document = await documentService.uploadAndIndex(
      req.file,
      title,
      category || 'otro',
      description || '',
      req.user!.id
    );

    res.status(201).json({
      message: 'Documento subido y siendo indexado. Estará disponible en unos momentos.',
      document,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDocuments(req: Request, res: Response, next: NextFunction) {
  try {
    const { category } = req.query;
    const documents = await documentService.getAll(category as string);
    res.json({ documents });
  } catch (error) {
    next(error);
  }
}

export async function deleteDocument(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await documentService.delete(id);
    res.json({ message: 'Documento eliminado correctamente' });
  } catch (error) {
    next(error);
  }
}

export async function reindexDocument(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await documentService.reindex(id);
    res.json({ message: 'Documento siendo re-indexado' });
  } catch (error) {
    next(error);
  }
}

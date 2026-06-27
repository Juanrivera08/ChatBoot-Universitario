import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { openai } from '../config/openai';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export async function transcribeAudio(req: Request, res: Response, next: NextFunction) {
  const filePath = req.file?.path;

  try {
    if (!req.file || !filePath) {
      return next(new AppError('No se recibió audio', 400));
    }

    // Whisper acepta webm, ogg, mp3, mp4, wav, m4a entre otros
    const result = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-1',
      language: 'es',
    });

    const transcription = result.text.trim();
    logger.info(`Audio transcrito: "${transcription.slice(0, 60)}..."`);

    res.json({ text: transcription });
  } catch (error: any) {
    logger.error('Error transcribiendo audio:', error);
    next(new AppError('No se pudo transcribir el audio', 500));
  } finally {
    // Eliminar el archivo temporal siempre
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

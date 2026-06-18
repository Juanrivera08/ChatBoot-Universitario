import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { genAI } from '../config/genai';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export async function transcribeAudio(req: Request, res: Response, next: NextFunction) {
  const filePath = req.file?.path;

  try {
    if (!req.file || !filePath) {
      return next(new AppError('No se recibió audio', 400));
    }

    const audioBuffer = fs.readFileSync(filePath);
    const base64Audio = audioBuffer.toString('base64');

    // Gemini acepta audio/webm, audio/ogg, audio/mp4 entre otros
    const mimeType = (req.file.mimetype || 'audio/webm') as string;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Audio,
          mimeType,
        },
      },
      'Transcribe exactamente lo que se dice en este audio en español colombiano. ' +
      'Devuelve SOLO el texto transcrito, sin comillas, sin explicaciones adicionales. ' +
      'Si no hay voz clara, devuelve una cadena vacía.',
    ]);

    const transcription = result.response.text().trim();
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

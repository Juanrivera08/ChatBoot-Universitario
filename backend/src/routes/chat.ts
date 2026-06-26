import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { sendMessage, sendMessageStream, getHistory, submitFeedback, deleteConversation, pollPendingReply } from '../controllers/chatController';
import { transcribeAudio } from '../controllers/transcribeController';
import { chatRateLimit, pollRateLimit } from '../middleware/rateLimit';
import { chatValidators } from '../utils/validators';

const audioStorage = multer.diskStorage({
  destination: 'uploads/audio/',
  filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname) || '.webm'}`),
});

const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB máximo
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/mpeg', 'audio/x-m4a'];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Formato de audio no soportado'));
    }
  },
});

const router = Router();

router.post('/message', chatRateLimit, chatValidators, sendMessage);
router.post('/message/stream', chatRateLimit, chatValidators, sendMessageStream);
router.get('/history/:sessionId', getHistory);
router.post('/feedback/:sessionId', submitFeedback);
router.delete('/conversation/:sessionId', deleteConversation);
router.post('/transcribe', chatRateLimit, audioUpload.single('audio'), transcribeAudio);
router.get('/poll/:sessionId', pollRateLimit, pollPendingReply);

export default router;

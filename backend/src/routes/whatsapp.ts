import { Router } from 'express';
import { verifyWebhook, receiveMessage } from '../controllers/whatsappController';

const router = Router();

// Meta llama GET para verificar el webhook al configurarlo
router.get('/webhook', verifyWebhook);

// Meta llama POST cada vez que llega un mensaje
router.post('/webhook', receiveMessage);

export default router;

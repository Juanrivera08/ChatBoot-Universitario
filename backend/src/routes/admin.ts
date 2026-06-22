import { Router } from 'express';
import {
  getDashboardStats,
  getConversations,
  getConversationDetail,
  getFAQs,
  createFAQ,
  deleteFAQ,
  getAIConfig,
  updateAIConfig,
  getChartData,
  getLiveConversations,
  toggleHumanMode,
  adminReply,
} from '../controllers/adminController';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

// Todas las rutas admin requieren autenticación y rol admin
router.use(authenticate, requireAdmin);

router.get('/stats', getDashboardStats);
router.get('/charts', getChartData);
router.get('/conversations', getConversations);
router.get('/conversations/:id/messages', getConversationDetail);
router.get('/faqs', getFAQs);
router.post('/faqs', createFAQ);
router.delete('/faqs/:id', deleteFAQ);
router.get('/ai-config', getAIConfig);
router.put('/ai-config', updateAIConfig);

router.get('/live', getLiveConversations);
router.put('/conversations/:id/takeover', toggleHumanMode);
router.post('/conversations/:id/reply', adminReply);

export default router;

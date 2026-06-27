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
  adminTyping,
} from '../controllers/adminController';
import {
  getReportQueryTypes,
  getReportPreview,
  exportReportPdf,
  exportReportExcel,
} from '../controllers/reportController';
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
router.post('/conversations/:id/typing', adminTyping);

// Módulo de reportes — informes descargables de conversaciones (PDF/Excel)
router.get('/reports/query-types', getReportQueryTypes);
router.get('/reports/preview', getReportPreview);
router.get('/reports/export/pdf', exportReportPdf);
router.get('/reports/export/excel', exportReportExcel);

export default router;

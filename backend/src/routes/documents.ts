import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { uploadDocument, getDocuments, deleteDocument, reindexDocument } from '../controllers/documentController';
import { authenticate, requireAdmin } from '../middleware/auth';
import { uploadRateLimit } from '../middleware/rateLimit';
import { documentValidators } from '../utils/validators';

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueSuffix);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF'));
    }
  },
});

const router = Router();

router.get('/', authenticate, requireAdmin, getDocuments);
router.post(
  '/',
  authenticate,
  requireAdmin,
  uploadRateLimit,
  upload.single('file'),
  documentValidators,
  uploadDocument
);
router.delete('/:id', authenticate, requireAdmin, deleteDocument);
router.post('/:id/reindex', authenticate, requireAdmin, reindexDocument);

export default router;

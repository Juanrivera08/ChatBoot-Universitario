import { Router } from 'express';
import { login, createAdmin, me } from '../controllers/authController';
import { authenticate, requireAdmin } from '../middleware/auth';
import { authRateLimit } from '../middleware/rateLimit';
import { authValidators } from '../utils/validators';

const router = Router();

router.post('/login', authRateLimit, authValidators, login);
// Crear admin sólo lo puede hacer otro admin autenticado
router.post('/register', authenticate, requireAdmin, authValidators, createAdmin);
router.get('/me', authenticate, me);

export default router;

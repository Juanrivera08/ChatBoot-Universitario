import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import {
  getFlows, getFlow, createFlow, addStep,
  deleteFlow, toggleFlow, getSubmissions, updateSubmission,
} from '../controllers/flowController';

const router = Router();
router.use(authenticate, requireAdmin);

router.get('/', getFlows);
router.get('/submissions', getSubmissions);
router.get('/:id', getFlow);
router.post('/', createFlow);
router.post('/:id/steps', addStep);
router.delete('/:id', deleteFlow);
router.patch('/:id/toggle', toggleFlow);
router.patch('/submissions/:id', updateSubmission);

export default router;

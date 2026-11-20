// Routes for /api/ai: the AI helpers. All need a signed-in user and are rate-limited per user.

import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { getAiStatus, summarizeChat, draftFeedback, draftPosterSummary } from '../controllers/ai.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/status', getAiStatus);
router.post('/chat-summary', aiLimiter, summarizeChat);
router.post('/feedback-draft', requireRole('Supervisor', 'Administrator'), aiLimiter, draftFeedback);
router.post('/poster-summary', requireRole('Student'), aiLimiter, draftPosterSummary);

export default router;

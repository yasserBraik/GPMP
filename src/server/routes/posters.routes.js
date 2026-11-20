// Routes for /api/posters: the public project posters wall.
// Listing and viewing are public (no sign-in needed); posting and removing need an account.

import { Router } from 'express';
import { requireAuth, optionalAuth, requireRole } from '../middleware/auth.js';
import { uploadPoster } from '../middleware/upload.js';
import {
  listPosters,
  getPosterImage,
  getMyPoster,
  saveMyPoster,
  deletePoster,
} from '../controllers/posters.controller.js';

const router = Router();

// Public (optionalAuth only adds "canDelete" for people who are signed in)
router.get('/', optionalAuth, listPosters);
router.get('/mine', requireAuth, getMyPoster); // must come before '/:id/image'
router.get('/:id/image', getPosterImage);

// requireRole runs before uploadPoster, so a non-student's file is never saved
router.put('/mine', requireAuth, requireRole('Student'), uploadPoster, saveMyPoster);
router.delete('/:id', requireAuth, deletePoster);

export default router;

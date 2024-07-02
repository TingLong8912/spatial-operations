// src/routes/index.mjs

import ApiRoutes from './ApiRoutes.mjs';
import { Router } from 'express';

const router = Router();

/* ROUTES */
router.use('/api', ApiRoutes);
// Add more routes as needed

export { router };

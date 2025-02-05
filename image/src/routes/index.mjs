// src/routes/index.mjs

import ApiRoutes from './ApiRoutes.mjs';
import SpatialRoutes from './SpatialRoutes.mjs';
import { Router } from 'express';

const router = Router();

/* ROUTES */
router.use('/api', ApiRoutes);
router.use('/spatial-operation', SpatialRoutes);

export { router };

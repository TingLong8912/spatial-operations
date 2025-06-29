// src/routes/index.mjs

import ApiRoutes from './ApiRoutes.js';
import SpatialRoutes from './SpatialRoutes.js';
import MathRoutes from './MathRoutes.js';
import { Router } from 'express';

const router = Router();

/* ROUTES */
router.use('/api', ApiRoutes);
router.use('/spatial-operation', SpatialRoutes);
// router.use('/math', MathRoutes); 

export { router };

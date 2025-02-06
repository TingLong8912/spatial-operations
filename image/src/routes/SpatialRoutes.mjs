import { Router } from 'express';
import * as turf from '@turf/turf';

const router = Router();

router.post('/select', (req, res) => {
    try {
        const { geometry1, geometry2, relations } = req.body;

        if (!geometry1 || !geometry2 || !Array.isArray(relations) || relations.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid parameters' });
        }

        const geo1 = turf.geometry(geometry1.type, geometry1.coordinates);
        const geo2 = turf.geometry(geometry2.type, geometry2.coordinates);

        const results = {};

        relations.forEach(relation => {
            switch (relation) {
                case 'equals':
                    results.equals = turf.booleanEqual(geo1, geo2);
                    break; 
                case 'within':
                    results.within = turf.booleanWithin(geo1, geo2);
                    break;
                case 'intersects':
                    results.intersects = turf.booleanIntersects(geo1, geo2);
                    break;
                case 'contains':
                    results.contains = turf.booleanContains(geo1, geo2);
                    break;
                case 'disjoint':
                    results.disjoint = turf.booleanDisjoint(geo1, geo2);
                    break;
                case 'overlaps':
                    results.overlaps = turf.booleanOverlap(geo1, geo2);
                    break;
                case 'touches':
                    results.touches = turf.booleanTouch(geo1, geo2);
                    break;
                // case 'covers'
                // case 'crosses'
                default:
                    results[relation] = 'Invalid relation';
            }
        });

        res.json({ relations: results });
    } catch (err) {
        console.error('Spatial relation error:', err);
        res.status(500).json({ error: 'Failed to process spatial relations' });
    }
});

router.post('/within', (req, res) => {
    try {
        const { geometry1, geometry2, relations } = req.body;

        if (!geometry1 || !geometry2 || !Array.isArray(relations) || relations.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid parameters' });
        }

        const geo1 = turf.geometry(geometry1.type, geometry1.coordinates);
        const geo2 = turf.geometry(geometry2.type, geometry2.coordinates);

        const results = {};
        results.within = turf.booleanWithin(geo1, geo2);
   
        res.json({ relations: results });
    } catch (err) {
        console.error('Spatial relation error:', err);
        res.status(500).json({ error: 'Failed to process spatial relations' });
    }
});

export default router;

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
        const { targetPt, referObj } = req.body;

        if (!targetPt || !referObj ) {
            return res.status(400).json({ error: 'Missing or invalid parameters' });
        }

        const results = {};
        let tempObjects = [];
        
        if (referObj.type === 'FeatureCollection') {
            referObj.features.forEach(feature => {
                if (turf.booleanWithin(targetPt, feature)) {
                    tempObjects.push(feature);
                }
            });
        } else {
            turf.booleanWithin(targetPt, referObj)
            tempObjects.push(referObj);
        }

        results.within = turf.featureCollection(tempObjects);

        res.json({ relations: results });
    } catch (err) {
        console.error('Spatial relation error:', err);
        res.status(500).json({ error: 'Failed to process spatial relations' });
    }
});

router.get('/test', (req, res) => {
    try {
        const targetPt = {
            "type": "Feature",
            "properties": {},
            "geometry": {
                "coordinates": [
                    121.53480482883009,
                    25.01064222335269
                ],
                "type": "Point"
            }
        };
    
        const referObj = {
            "type": "FeatureCollection",
            "features": [
              {
                "type": "Feature",
                "properties": {},
                "geometry": {
                  "coordinates": [
                    [
                      [
                        121.53171751618294,
                        25.01408660669479
                      ],
                      [
                        121.52745179917275,
                        25.004967395140625
                      ],
                      [
                        121.53346755393073,
                        25.000605793760755
                      ],
                      [
                        121.53910048793131,
                        25.011360826364907
                      ],
                      [
                        121.53920986529027,
                        25.014780432027408
                      ],
                      [
                        121.53171751618294,
                        25.01408660669479
                      ]
                    ]
                  ],
                  "type": "Polygon"
                }
              },
              {
                "type": "Feature",
                "properties": {},
                "geometry": {
                  "coordinates": [
                    [
                      [
                        121.54752254459106,
                        25.012500705499278
                      ],
                      [
                        121.54331151626116,
                        25.009081036354146
                      ],
                      [
                        121.54878038422237,
                        25.007544632260363
                      ],
                      [
                        121.55014760121264,
                        25.013293658657247
                      ],
                      [
                        121.54752254459106,
                        25.012500705499278
                      ]
                    ]
                  ],
                  "type": "Polygon"
                }
              }
            ]
        };

        const results = {};

        let tempObjects = [];
        referObj.features.forEach(feature => {
            if (turf.booleanWithin(targetPt, feature)) {
                tempObjects.push(feature);
            }
        });

        results.within = turf.featureCollection(tempObjects);

        res.json({ relations: results });
    } catch (err) {
        console.error('Spatial relation error:', err);
        res.status(500).json({ error: 'Failed to process spatial relations' });
    };
});

export default router;

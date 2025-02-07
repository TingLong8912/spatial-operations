import { Router } from 'express';
import * as turf from '@turf/turf';

const router = Router();

const spatialRelations = {
    equals: turf.booleanEqual,
    disjoint: turf.booleanDisjoint,
    touches: turf.booleanTouch,
    contains: turf.booleanContains,
    covers: turf.booleanCover,
    intersects: turf.booleanIntersects,
    within: relationFunction,
    crosses: turf.booleanCrosses,
    overlaps: turf.booleanOverlap
};

// Helper function to process spatial relations
const processSpatialRelation = (req, res, relationFunction, relationName) => {
    try {
        // Extract target geometry and reference geometry from request body
        const { targetGeom, referGeom } = req.body;

        // Validate input parameters
        if (!targetGeom || !referGeom) {
            return res.status(400).json({ error: 'Missing or invalid parameters' });
        }

        // Compute the spatial relation
        const result = {};
        let tempObjects = [];

        // Check if reference object is a FeatureCollection
        if (referGeom.type === 'FeatureCollection') {
            // Iterate through features and check if target point is within them
            referGeom.features.forEach(feature => {
                if (relationFunction(targetGeom, feature)) {
                    tempObjects.push(feature);
                }
            });
        } else {
            // Check if target point is within a single reference object
            if (relationFunction(targetGeom, referGeom)) {
                tempObjects.push(referGeom);
            }
        }
        result[relationName] = tempObjects;

        // Return result as JSON response
        res.json({ relation: relationName, result });
    } catch (err) {
        // Handle errors and return the error message to the frontend
        console.error(`${relationName} relation error:`, err);
        res.status(500).json({ error: `Failed to process ${relationName} relation`, details: err.message });
    }
};

// Define spatial relation endpoints
router.post('/equals', (req, res) => processSpatialRelation(req, res, spatialRelations.equals, 'Equals'));

router.post('/disjoint', (req, res) => processSpatialRelation(req, res, spatialRelations.disjoint, 'Disjoint'));

router.post('/touches', (req, res) => processSpatialRelation(req, res, spatialRelations.touches, 'Touches'));

router.post('/contains', (req, res) => processSpatialRelation(req, res, spatialRelations.contains, 'Contains'));

router.post('/covers', (req, res) => processSpatialRelation(req, res, spatialRelations.covers, 'Covers'));

router.post('/intersects', (req, res) => processSpatialRelation(req, res, spatialRelations.intersects, 'Intersects'));

router.post('/within', (req, res) => processSpatialRelation(req, res, spatialRelations.within, 'Within'));

router.post('/crosses', (req, res) => processSpatialRelation(req, res, spatialRelations.crosses, 'Crosses'));

router.post('/overlaps', (req, res) => processSpatialRelation(req, res, spatialRelations.overlaps, 'Overlaps'));

router.get('/test', (req, res) => {
    try {
        const targetGeom = {
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
    
        const referGeom = {
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

        if (referGeom.type === 'FeatureCollection') {
            referGeom.features.forEach(feature => {
                if (turf.booleanWithin(targetGeom, feature)) {
                    tempObjects.push(feature);
                }
            });
        } else {
            turf.booleanWithin(targetGeom, referGeom)
            tempObjects.push(referGeom);
        }
        
        results.within = turf.featureCollection(tempObjects);

        res.json({ data: results });
    } catch (err) {
        console.error('Spatial relation error:', err);
        res.status(500).json({ 
            error: 'Failed to process spatial relations',
            message: err
        });
    };
});

export default router;

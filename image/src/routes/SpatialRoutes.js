import { Router } from 'express';
import * as turf from '@turf/turf';

const router = Router();

///////////////////////////////////////////////////
//
//
//   TOPOLOGY
//
//
///////////////////////////////////////////////////

// All topogical relations
const spatialRelations = {
  equals: turf.booleanEqual,
  disjoint: turf.booleanDisjoint,
  touches: turf.booleanTouches,
  contains: turf.booleanContains,
  // covers: turf.booleanCover,
  intersects: turf.booleanIntersects,
  within: turf.booleanWithin,
  crosses: turf.booleanCrosses,
  overlaps: turf.booleanOverlap
};

// Function to process spatial topogical relations
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

///////////////////////////////////////////////////
//
//
//   DIRECTION
//
//
///////////////////////////////////////////////////

// Convert featurecollection to multiXXX
function ConvertGeoJsonTypeToMulti(featureCollection) {
  if (!featureCollection || featureCollection.type !== "FeatureCollection") {
    return "Invalid GeoJSON FeatureCollection";
  }
  
  const types = new Set();
  
  featureCollection.features.forEach(feature => {
    if (feature.type !== "Feature" || !feature.geometry) {
      types.add("Invalid Feature");
    } else {
      const geomType = feature.geometry.type;
      if (["MultiPoint", "MultiLineString", "MultiPolygon"].includes(geomType)) {
        types.add(geomType);
      } else if (["Point", "LineString", "Polygon"].includes(geomType)) {
        types.add(geomType);
      } else {
        types.add("Other");
      }
    }
  });
  
  if (types.size === 1) {
    const final_type = [...types][0];
    switch (final_type) {
      case ("Polygon"):
        return "MultiPolygon";
      case ("LineString"):
        return "MultiLineString";
      case ("Point"):
        return "MultiPoint";
      default:
        return final_type;
    }
  } else {
    return "Mix";
  }
}

// Radial model
// reference: https://www.geeksforgeeks.org/tangents-two-convex-polygons/
function calculateAzimuthRange(upperTangent, lowerTangent) {
  function calculateAzimuth(line) {
      const [[x1, y1], [x2, y2]] = line;
      let theta = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
      return (theta + 360) % 360; 
  }

  function reverseDirection(angle) {
      return (angle + 180) % 360;
  }

  function getCardinalDirection(angle) {
      const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
      return directions[Math.round(angle / 45) % 8];
  }

  const upperAzimuth = calculateAzimuth(upperTangent);
  const lowerAzimuth = calculateAzimuth(lowerTangent);
  const azimuthRange = [Math.min(upperAzimuth, lowerAzimuth), Math.max(upperAzimuth, lowerAzimuth)];

  const reversedAzimuthRange = azimuthRange.map(reverseDirection).sort((a, b) => a - b);

  const directionRange = azimuthRange.map(getCardinalDirection);
  const reversedDirectionRange = reversedAzimuthRange.map(getCardinalDirection);

  return {
    azimuthRange: azimuthRange.map(a => a.toFixed(2)),
    reversedAzimuthRange: reversedAzimuthRange.map(a => a.toFixed(2)),
    directionRange,
    reversedDirectionRange
  };
}

// Fucntion to process bearing relations
const calculateBearing = (targetGeom, referGeom) => {
  const geom1 = targetGeom.type;
  const geom2 = referGeom.type;

  const getPointFromFeature = {
    Point: {
      Point: () => {
        // point to point
        const pointA = targetGeom.geometry.coordinates;
        const pointB = referGeom.geometry.coordinates;

        return {pointA, pointB};
      },
      LineString: () => {
        // point to linestring
        const nearest = turf.nearestPointOnLine(referGeom, targetGeom);
        const pointA = targetGeom.geometry.coordinates;
        const pointB = nearest.geometry.coordinates;

        return {pointA, pointB};
      },
      Polygon: () => {
        // point to polygon
        const boundary = turf.polygonToLine(referGeom);
        const nearest = turf.nearestPoint(targetGeom, boundary);
        const pointA = targetGeom.geometry.coordinates;
        const pointB = nearest.geometry.coordinates;

        return {pointA, pointB};
      },
      FeatureCollection: () => {

      }
    },
    LineString: {
      Point: () => {
        // linestring to point
        const nearest = turf.nearestPointOnLine(targetGeom, referGeom);
        const pointA = nearest.geometry.coordinates;
        const pointB = referGeom.geometry.coordinates;

        return {pointA, pointB};
      },
      LineString: () => {

      },
      Polygon: () => {

      },
      FeatureCollection: () => {

      }
    },
    Polygon: {
      Point: () => {

      },
      LineString: () => {

      },
      Polygon: () => {

      },
      FeatureCollection: () => {
        
      }
    },
    FeatureCollection: {
      Point: () => {},
      LineString: () => {},
      Polygon: () => {},
      FeatureCollection: () => {}
    }
  };
  
  if (getPointFromFeature[geom1] && getPointFromFeature[geom1][geom2]) {
    const result = getPointFromFeature[geom1][geom2](targetGeom, referGeom);
    console.log(result); 
  }


    if (geom1 === "Point" && geom2 === "Point") {
        // 點對點
        pointA = targetGeom.geometry.coordinates;
        pointB = referGeom.geometry.coordinates;
    } else if (geom1 === "Point" && geom2 === "LineString") {
        // 點對線
        const nearest = turf.nearestPointOnLine(referGeom, targetGeom);
        pointA = targetGeom.geometry.coordinates;
        pointB = nearest.geometry.coordinates;
    } else if (geom1 === "Point" && geom2 === "Polygon") {
        // 點對面
        const boundary = turf.lineString(referGeom.geometry.coordinates[0]);
        const nearest = turf.nearestPoint(targetGeom, boundary);
        pointA = targetGeom.geometry.coordinates;
        pointB = nearest.geometry.coordinates;
    } else if (geom1 === "LineString" && geom2 === "LineString") {
        // 線對線（用中點）
        const mid1 = turf.alongmidpoint(targetGeom);
        const mid2 = turf.midpoint(referGeom);
        pointA = mid1.geometry.coordinates;
        pointB = mid2.geometry.coordinates;
    } else if (geom1 === "Polygon" && geom2 === "Polygon") {
        // 面對面（用質心）
        const centroid1 = turf.centroid(targetGeom);
        const centroid2 = turf.centroid(referGeom);
        pointA = centroid1.geometry.coordinates;
        pointB = centroid2.geometry.coordinates;
    } else if (geom1.startsWith("Multi")) {
        // 多點、多線、多面（取質心）
        const centroid1 = centroid(targetGeom);
        pointA = centroid1.geometry.coordinates;
        if (geom2.startsWith("Multi")) {
            const centroid2 = turf.centroid(referGeom);
            pointB = centroid2.geometry.coordinates;
        } else {
            const nearest = turf.nearestPoint(targetGeom, referGeom);
            pointB = nearest.geometry.coordinates;
        }
    } else if (geom1 === "Point" && geom2 === "FeatureCollection") {
        // 點對 FeatureCollection（找最近的圖徵）
        let nearestFeature = null;
        let minDistance = Infinity;
        
        referGeom.features.forEach(f => {
            let nearestCandidate;
            if (f.geometry.type === "Point") {
                nearestCandidate = f;
            } else if (f.geometry.type === "LineString") {
                nearestCandidate = turf.nearestPointOnLine(f, targetGeom);
            } else if (f.geometry.type === "Polygon") {
                const boundary = turf.lineString(f.geometry.coordinates[0]);
                nearestCandidate = turf.nearestPoint(targetGeom, boundary);
            }
            
            if (nearestCandidate) {
                const dist = Math.hypot(
                    targetGeom.geometry.coordinates[0] - nearestCandidate.geometry.coordinates[0],
                    targetGeom.geometry.coordinates[1] - nearestCandidate.geometry.coordinates[1]
                );
                if (dist < minDistance) {
                    minDistance = dist;
                    nearestFeature = nearestCandidate;
                }
            }
        });
        
        if (nearestFeature) {
            pointA = targetGeom.geometry.coordinates;
            pointB = nearestFeature.geometry.coordinates;
        } else {
            throw new Error("FeatureCollection 中沒有適合的圖徵");
        }
    } else {
        throw new Error("不支援的圖徵類型組合");
    }
    
    return bearing(pointA, pointB);
}

///////////////////////////////////////////////////
//
//
//   API ROUTE
//
//
///////////////////////////////////////////////////

router.post('/equals', (req, res) => processSpatialRelation(req, res, spatialRelations.equals, 'Equals'));

router.post('/disjoint', (req, res) => processSpatialRelation(req, res, spatialRelations.disjoint, 'Disjoint'));

router.post('/touches', (req, res) => processSpatialRelation(req, res, spatialRelations.touches, 'Touches'));

router.post('/contains', (req, res) => processSpatialRelation(req, res, spatialRelations.contains, 'Contains'));

router.post('/covers', (req, res) => processSpatialRelation(req, res, spatialRelations.covers, 'Covers'));

router.post('/intersects', (req, res) => processSpatialRelation(req, res, spatialRelations.intersects, 'Intersects'));

router.post('/within', (req, res) => processSpatialRelation(req, res, spatialRelations.within, 'Within'));

router.post('/crosses', (req, res) => processSpatialRelation(req, res, spatialRelations.crosses, 'Crosses'));

router.post('/overlaps', (req, res) => processSpatialRelation(req, res, spatialRelations.overlaps, 'Overlaps'));

///////////////////////////////////////////////////
//
//
//   TEST
//
//
///////////////////////////////////////////////////

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

router.get('/bearing', (req, res) => {
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
    results.bearing = calculateBearing(targetGeom, referGeom);

    res.json({ data: results });
  } catch (err) {
    console.error('Spatial relation error:', err);
    res.status(500).json({ 
        error: 'Failed to process spatial relations',
        message: err
    });
  };
});

router.get('/grandpa', async (rep, res) => {
  /**
   * 計算兩條線段的交點
   * @param {Array} line1 - 第一條線段的端點，格式為 [[x1, y1], [x2, y2]]
   * @param {Array} line2 - 第二條線段的端點，格式為 [[x3, y3], [x4, y4]]
   * @returns {Array} 交點座標 [x, y]
   */

  const a = [[2, 2], [3, 1], [3, 3], [5, 2], [4, 0]];
  const b = [[0, 1], [1, 0], [0, -2], [1, 0], [2, -2]];
  
  async function calculateOuterTangentsAndIntersections(polygonA, polygonB) { 
    // const url = 'http://localhost:4000/math/tangent'; // local
    const url = 'https://getroadmile.sgis.tw/math/tangent';
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ a: polygonA, b: polygonB }),
      });

      const data = await response.json();
      const { upperTangent, lowerTangent } = data;
      const result = calculateAzimuthRange(upperTangent, lowerTangent);

      return { result: result };
    } catch (error) {
      console.error('Error:', error);
      return { error: 'Failed to calculate tangents' };
    }
  }

  const { result } = await calculateOuterTangentsAndIntersections(a, b);

  res.json({ result });
});

router.get('/azimuth', (req, res) => {
  try {
      // Extract target geometry and reference geometry from request body
      const { targetGeom, referGeom } = req.body;

      // Validate input parameters
      if (!targetGeom || !referGeom) {
          return res.status(400).json({ error: 'Missing or invalid parameters' });
      }

      // Compute the spatial relation
      const referCentroid = turf.centroid(referGeom);
      const targetCentroid = turf.centroid(targetGeom);

      const bearing = turf.bearing(referCentroid, targetCentroid);

      // Return result as JSON response
      res.json({ relation: 'azimuth', bearing });
  } catch (err) {
      // Handle errors and return the error message to the frontend
      console.error(`Azimuth relation error:`, err);
      res.status(500).json({ error: `Failed to process azimuth relation`, details: err.message });
  }
});

export default router;

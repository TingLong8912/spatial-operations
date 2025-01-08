import { Router } from 'express';
import * as turf from '@turf/turf';
import { features } from 'process';
import { copyFileSync, promises as fs } from 'fs';
import pg from 'pg';

const router = Router();

// 1 Basic Operation
// 1.1 Limit Objects
const getLimitObject = (inputPt, referObject, bufferThreshold) => {
    const bufferedPoint = turf.buffer(inputPt, bufferThreshold, { units: 'kilometers' });
    var intersectingFeatures = [];

    referObject.features.forEach(feature => {
        if (turf.booleanIntersects(feature, bufferedPoint)) {
            intersectingFeatures.push(feature);
        }
    });

    return turf.featureCollection(intersectingFeatures);
};

const findTheNearestRoad = (inputPt, bufferedRoadStrings, num = 1) => {
    console.log("findTheNearestRoad...");
    let nearestRoadList = [];
    const roadNameOfinputPt = inputPt.properties.index;
    const roadStringsFeatures = bufferedRoadStrings.features;

    for (let i = 0; i < roadStringsFeatures.length; i++) {
        const feature = roadStringsFeatures[i];
        const roadNameOfRoad = feature.properties.roadnum;

        if (roadNameOfinputPt !== 'unknown' && roadNameOfinputPt !== roadNameOfRoad) return;
        
        const projectedPoint = turf.nearestPointOnLine(feature, inputPt, { units: "kilometers" });
        const distance = turf.distance(inputPt, projectedPoint);
        const roadId = feature.properties.id;
    
        nearestRoadList.push({
            "distance": distance,
            "roadFeature": feature,
            "projectedPoint": projectedPoint, 
            "roadId": roadId
        });
    }

    // 按距離排序
    nearestRoadList.sort((a, b) => a.distance - b.distance);

    // 取最近的 num 個點
    let topNNearestPoints = [];
    let roadIds = new Set();

    for (let point of nearestRoadList) {
        if (!roadIds.has(point.roadId)) {
            topNNearestPoints.push({
                "coordinates": point.projectedPoint,
                "roadFeature": point.roadFeature,
                "roadId": point.roadId,
                "distance": point.distance
            });
            roadIds.add(point.roadId); // 確保不重複添加同一條路
        }
        if (topNNearestPoints.length == num) break;
    };

    console.log("findTheNearestRoad done!");
    return topNNearestPoints;
};


// 1.2 Project inputPt and split the roadStrings
const initialData = (inputPt, roadStrings, stationsPts, threshold=0.2) => {
    console.log("running initialData...");

    const bufferThreshold = 4;
    const bufferedRoadStrings = getLimitObject(inputPt, roadStrings, bufferThreshold);
    const bufferedStationsPts = getLimitObject(inputPt, stationsPts, bufferThreshold);

    const theNearestRoadOfInputPt = findTheNearestRoad(inputPt, bufferedRoadStrings);
    const inputPtToPathDistance = theNearestRoadOfInputPt[0]['distance'];

    if (inputPtToPathDistance < threshold) {
        console.log("inputPtToPathDistance < threshold")
 
        // 1 Proprocessing
        var splitLineStrings = [];
        const allTop2NearestPointOnRoad = {};

        // 1.1 Projecting StationPts: Iterate through each point in the MultiPoint
        // 每一個樁號點要映射到兩個(雙向)道路
        bufferedStationsPts.features.forEach(feature => {
            const stationPt = turf.point(feature.geometry.coordinates);
            stationPt.properties['index'] = feature.properties.index;
            const mile = convertStringToFloat(feature.properties.name);
            
            // Find the nearest road
            const top2NearestPoints = findTheNearestRoad(stationPt, bufferedRoadStrings, 2);

            // Create empty list to store stations on each roads
            if (allTop2NearestPointOnRoad[top2NearestPoints[0].roadId] == undefined) allTop2NearestPointOnRoad[top2NearestPoints[0].roadId] = [];
            if (allTop2NearestPointOnRoad[top2NearestPoints[1].roadId] == undefined) allTop2NearestPointOnRoad[top2NearestPoints[1].roadId] = [];

            top2NearestPoints[0]['mile'] = mile;
            top2NearestPoints[1]['mile'] = mile;
            allTop2NearestPointOnRoad[top2NearestPoints[0].roadId].push(top2NearestPoints[0])
            allTop2NearestPointOnRoad[top2NearestPoints[1].roadId].push(top2NearestPoints[1])
        });

        // 1.2 Split Road: Use each pair of adjacent projected points to split the whole LineString
        // 迭代每一條道路，找到落在該道路的樁號點並切割
        bufferedRoadStrings.features.forEach(feature => {
            const roadId = feature.properties.id;
            const roadnum = feature.properties.roadnum;

            for (let key in allTop2NearestPointOnRoad) {
                if (allTop2NearestPointOnRoad.hasOwnProperty(key)) {
                    const value = allTop2NearestPointOnRoad[key];
                    for (let i = 0; i < value.length - 1; i++) {
                        const startPoint = value[i].coordinates;
                        const endPoint =  value[i+1].coordinates;
                        startPoint.properties = {"Name": "Start_Point", "Mile": value[i].mile};
                        endPoint.properties = {"Name": "End_Point", "Mile": value[i+1].mile};
                       
                        if (turf.booleanIntersects(turf.buffer(feature, 1, { units: "meters" }), turf.buffer(startPoint, 1, { units: "meters" }))) {
                            // Split the LineString by the pair of points
                            const lineString = turf.lineString(feature.geometry.coordinates[0]);
        
                            const split = turf.lineSlice(startPoint, endPoint, lineString);
                            split.properties = {
                                "startPt": startPoint, 
                                "endPt": endPoint,
                                "roadnum": roadnum,
                                "id": roadId // to keep track of which LineString it came from
                            };
                            
                            // Collect the split LineString
                            splitLineStrings.push(split);
                        }             
                    }
                }
            }
        });
        const splitLineStringsGeoJSON = turf.featureCollection(splitLineStrings);

        // 2 Get the Needing Geometry: targetline, referLine and the two endpoints mile of targeline
        const top2NearestSplitRoad = findTheNearestRoad(inputPt, splitLineStringsGeoJSON, 2);
        const targetLine = top2NearestSplitRoad[0]['roadFeature'];
        const referLine = top2NearestSplitRoad[1]['roadFeature'];

        const targetLineCoords = turf.getCoords(targetLine);
        const endPtA = turf.point(targetLineCoords[0]);
        const endPtB = turf.point(targetLineCoords[targetLineCoords.length - 1]);
    
        const nearestPointA = convertStringToFloat(turf.nearestPoint(endPtA, stationsPts).properties.Name);
        const nearestPointB = convertStringToFloat(turf.nearestPoint(endPtB, stationsPts).properties.Name);

        const projectedInputPt = top2NearestSplitRoad[0].coordinates;
        
        // 3 Output
        console.log("initialData successed"); 
        return {
            "status": "success",
            "message": '',
            "data": {
                "projectedInputPt": projectedInputPt,
                "splitLineStringsGeoJSON": splitLineStringsGeoJSON,
                "targetLine": targetLine,
                "referLine": referLine,
                "nearestPointA": {
                    "endPt": endPtA,
                    "endPtMile": nearestPointA
                },
                "nearestPointB": {
                    "endPt": endPtB,
                    "endPtMile": nearestPointB
                }
            }
        }
    } else {
        console.log("initialData failed"); 
        return {
            "status": "error",
            "message": "The input point is too far from the road.",
            "data": {}
        }
    }
};

// 1.3 Find the nearest point according to roadStrings
const findNearestPointOnMultiLineString = (multiLineString, points) => {
    let nearestPointOverall = null;
    let minDistance = Infinity;

    points.features.forEach(point => {
        // Find the nearest point on the MultiLineString
        const nearestPointOnLine = turf.nearestPointOnLine(multiLineString, point);
        const distance = nearestPointOnLine.properties.dist; // Distance in meters

        // Check if it's the closest point so far
        if (distance < minDistance) {
            minDistance = distance;
            nearestPointOverall = {
                point: point, // The original input point
                nearestPointOnLine: nearestPointOnLine, // The nearest point on the line
                distance: distance // The distance in meters
            };
        }
    });

    return nearestPointOverall;
};

// 2 Spatial Operation
// 2.1 Intersect
const getIntersectedObject = (inputPt, referObjectDict, referColumnDict, keysToConsider) => {
    console.log("running getIntersectedObject...");
    const result = {};

    keysToConsider.forEach(key => {
        if (referObjectDict[key]) {
            const referObject = referObjectDict[key];
            const referColumn = referColumnDict[key];
            const intersectingFeatures = [];

            referObject.features.forEach(feature => {
                if (turf.booleanIntersects(inputPt, feature)) {
                    intersectingFeatures.push(feature.properties[referColumn]);
                }
            });

            result[key] = intersectingFeatures;
        }
    });

    return result;
};

// 2.2 Contain
const getContainObject = (inputPt, referObjectDict, referColumnDict, keysToConsider) => {
    console.log("running getContainObject...");
    const result = {};

    keysToConsider.forEach(key => {
        if (referObjectDict[key]) {
            const referObject = referObjectDict[key];
            const referColumn = referColumnDict[key];
            const tempObjects = [];
            
            referObject.features.forEach(feature => {
                if (turf.booleanContains(inputPt, feature)) {
                    tempObjects.push(feature.properties[referColumn]);
                }
            });

            result[key] = tempObjects;
        }
    });

    return result;
};

// 2.3 Cross
const getCrossObject = (inputPt, referObjectDict, referColumnDict, keysToConsider) => {
    console.log("running getCrossObject...");
    const result = {};

    keysToConsider.forEach(key => {
        if (referObjectDict[key]) {
            const referObject = referObjectDict[key];
            const referColumn = referColumnDict[key];
            const tempObjects = [];
            
            referObject.features.forEach(feature => {
                if (turf.booleanCrosses(inputPt, feature)) {
                    tempObjects.push(feature.properties[referColumn]);
                }
            });

            result[key] = tempObjects;
        }
    });

    return result;
};

// 2.4 Disjoint
const getDisjointObject = (inputPt, referObjectDict, referColumnDict, keysToConsider) => {
    console.log("running getDisjointObject...");
    const result = {};

    keysToConsider.forEach(key => {
        if (referObjectDict[key]) {
            const referObject = referObjectDict[key];
            const referColumn = referColumnDict[key];
            const tempObjects = [];
            
            referObject.features.forEach(feature => {
                if (turf.booleanDisjoint(inputPt, feature)) {
                    tempObjects.push(feature.properties[referColumn]);
                }
            });

            result[key] = tempObjects;
        }
    });

    return result;
};

// 2.5 Equal
const getEqualObject = (inputPt, referObjectDict, referColumnDict, keysToConsider) => {
    console.log("running getEqualObject...");
    const result = {};

    keysToConsider.forEach(key => {
        if (referObjectDict[key]) {
            const referObject = referObjectDict[key];
            const referColumn = referColumnDict[key];
            const tempObjects = [];
            
            referObject.features.forEach(feature => {
                if (turf.booleanEqual(inputPt, feature)) {
                    tempObjects.push(feature.properties[referColumn]);
                }
            });

            result[key] = tempObjects;
        }
    });

    return result;
};

// 2.6 Overlap
const getOverlapObject = (inputPt, referObjectDict, referColumnDict, keysToConsider) => {
    console.log("running getOverlapObject...");
    const result = {};

    keysToConsider.forEach(key => {
        if (referObjectDict[key]) {
            const referObject = referObjectDict[key];
            const referColumn = referColumnDict[key];
            const tempObjects = [];
            
            referObject.features.forEach(feature => {
                if (turf.booleanOverlap(inputPt, feature)) {
                    tempObjects.push(feature.properties[referColumn]);
                }
            });

            result[key] = tempObjects;
        }
    });

    return result;
};

// 2.7 Touch 
const getTouchObject = (inputPt, referObjectDict, referColumnDict, keysToConsider) => {
    console.log("running getTouchObject...");
    const result = {};

    keysToConsider.forEach(key => {
        console.log(key);
        if (referObjectDict[key]) {
            const referObject = referObjectDict[key];
            const referColumn = referColumnDict[key];
            const tempObjects = [];
            
            referObject.features.forEach(feature => {
                if (turf.booleanTouches(inputPt, feature)) {
                    tempObjects.push(feature.properties[referColumn]);
                }
            });

            result[key] = tempObjects;
        }
    });

    return result;
};

// 2.8 Within
const getWithinObject = (inputPt, referObjectDict, referColumnDict, keysToConsider) => {
    console.log("running getWithinObject...");
    const result = {};

    keysToConsider.forEach(key => {
        if (referObjectDict[key]) {
            const referObject = referObjectDict[key];
            const referColumn = referColumnDict[key];
            const tempObjects = [];
            referObject.features.forEach(feature => {
                if (turf.booleanWithin(inputPt, feature)) {
                    tempObjects.push(feature.properties[referColumn]);
                }
            });

            result[key] = tempObjects;
        }
    });

    return result;
};

// 2.9 Direction(for road)
const getDirection = (targetLine, referLine, nearestPointA, nearestPointB) => {
    console.log("running getDirection...");
    const maxDistance = 0.2; 
    const step = 0.001; 
    const initialDistance = 0.001; 
    const directions = [0, 90, 180, 270];
    const mileA = nearestPointA['endPtMile'];
    const mileB = nearestPointB['endPtMile'];
    const endPtA = nearestPointA['endPt'];
    const endPtB = nearestPointB['endPt'];
    let targetDirection;
    
    const checkTranslation = (direction, distance) => {
        if (distance > maxDistance) {
            targetDirection = undefined;
            console.log(`find no intersect in ${direction}`)
            return;
        }
        const translatedLine = turf.transformTranslate(referLine, distance, direction, {"units": "kilometers"});
        const isDisjoint = turf.booleanDisjoint(translatedLine, targetLine);

        if (isDisjoint) {
            checkTranslation(direction, distance + step);
        } else {
            targetDirection = direction;
            return;
        }
    }

    directions.forEach(direction => {
        if (targetDirection === undefined) checkTranslation(direction, initialDistance);
    });

    let degreeToNorth;
    if (targetDirection === 0 || targetDirection === 180) {
        const isToNorth = mileA - mileB < 0; 
        if (isToNorth) {
            const is90degree = (turf.getCoord(endPtA)[0] - turf.getCoord(endPtB)[0]) > 0; 
            if (is90degree) {
                degreeToNorth = 90;
            } else {
                degreeToNorth = 270;
            }
        } else {
            const is90degree = (turf.getCoord(endPtB)[0] - turf.getCoord(endPtA)[0]) > 0; 
            if (is90degree) {
                degreeToNorth = 90;
            } else {
                degreeToNorth = 270;
            }
        }
    } else if (targetDirection === 90 || targetDirection === 270) {
        const isToNorth = mileA - mileB < 0; 
        if (isToNorth) {
            const is0degree = (turf.getCoord(endPtA)[1] - turf.getCoord(endPtB)[1]) > 0; 
            if (is0degree) {
                degreeToNorth = 0;
            } else {
                degreeToNorth = 180;
            }
        } else {
            const is0degree = (turf.getCoord(endPtB)[1] - turf.getCoord(endPtA)[1]) > 0; 
            if (is0degree) {
                degreeToNorth = 0;
            } else {
                degreeToNorth = 180;
            }
        }
    } else {
        degreeToNorth = undefined;
    }

    console.log("degreeToNorth: ", degreeToNorth, "\ntargetDirection: ", targetDirection);

    let direction;
    if (degreeToNorth === 0) {
        if (targetDirection === 90) {
            direction = "N";
        } else {
            direction = "S";
        }
    } else if (degreeToNorth > 0) {
        if (targetDirection - degreeToNorth > 0) {
            direction = "N";
        } else {
            direction = "S";
        }
    } else {
        direction = undefined;
    }

    return { "Route": [ direction ] };
};

// 2.10 BinaryDistance(DistanceNear/DistanceMiddle)
const getBinaryDistanceObjectProbability = (inputPt, referObjectDict, referColumnDict, keysToConsider) => {
    console.log("running getNearObjectProbability...");
    const resultDistanceNear = {'features': {}, 'names': {}};
    const resultDistanceMiddle = {'features': {}, 'names': {}};

    keysToConsider.forEach(key => {
        if (referObjectDict[key]) {
            const referObject = referObjectDict[key];
            const objectNameCol = referColumnDict[key];
            inputPt.properties[objectNameCol] = "InputPt";

            // Convert any feature to point
            let roadAncillaryFacilitiesMeanPt = [];
            referObject.features.forEach(feature => {  
                
                const mean = turf.centerMean(feature);
                mean.properties = feature.properties;
                roadAncillaryFacilitiesMeanPt.push(mean);
            });

            const roadAncillaryFacilitiesMeanPtCollection = turf.featureCollection(roadAncillaryFacilitiesMeanPt);

            // Get VoronoiPolygon
            const voronoiPolygonsOptions = {
                bbox: turf.bbox(referObject),
            };
            const voronoiPolygons = turf.voronoi(roadAncillaryFacilitiesMeanPtCollection, voronoiPolygonsOptions);
            voronoiPolygons.features.forEach(PolygonFeature => {
                roadAncillaryFacilitiesMeanPtCollection.features.forEach(PointFeature => {
                    if (turf.booleanWithin(PointFeature, PolygonFeature)) {
                        PolygonFeature.properties = PointFeature.properties;
                        return;
                    }
                });
            });

            // Add inputPt
            roadAncillaryFacilitiesMeanPtCollection.features.push(inputPt);
            const voronoiPolygons_with_inputPt = turf.voronoi(roadAncillaryFacilitiesMeanPtCollection, voronoiPolygonsOptions);
            let voronoiPolygonsOfInputPt;
            voronoiPolygons_with_inputPt.features.forEach(PolygonFeature => {
                roadAncillaryFacilitiesMeanPtCollection.features.forEach(PointFeature => {
                    if (turf.booleanWithin(PointFeature, PolygonFeature)) {
                        PolygonFeature.properties = PointFeature.properties;
                        if (PointFeature.properties[objectNameCol] === "InputPt") voronoiPolygonsOfInputPt = PolygonFeature
                        return;
                    }
                });
            });

            // Near probability algorithm
            let afterPolygon = [];
            let beforePolygon = [];
            if (voronoiPolygonsOfInputPt !== undefined) {
                for (let i = 0; i < voronoiPolygons.features.length; i++) {
                    let PolygonFeature_b = JSON.parse(JSON.stringify(voronoiPolygons.features[i]));
                    if (turf.booleanIntersects(PolygonFeature_b, voronoiPolygonsOfInputPt)) {
                        var area = turf.area(PolygonFeature_b);
                        PolygonFeature_b.properties['area'] = area / 1000000; // unit: km
                        var PolygonFeatureOutline = turf.polygonToLine(PolygonFeature_b);
                        var distance = turf.pointToLineDistance(inputPt, PolygonFeatureOutline); // unit: km
                        PolygonFeature_b.properties['distance'] = distance;
                        beforePolygon.push(PolygonFeature_b);
                    }
                }
                
                for (let i = 0; i < voronoiPolygons_with_inputPt.features.length; i++) {
                    let PolygonFeature_a = JSON.parse(JSON.stringify(voronoiPolygons_with_inputPt.features[i]));
                    if (turf.booleanIntersects(PolygonFeature_a, voronoiPolygonsOfInputPt)) {
                        var area = turf.area(PolygonFeature_a);
                        PolygonFeature_a.properties['area'] = area / 1000000; // unit: km
                        var PolygonFeatureOutline = turf.polygonToLine(PolygonFeature_a);
                        var distance = turf.pointToLineDistance(inputPt, PolygonFeatureOutline); // unit: km
                        PolygonFeature_a.properties['distance'] = distance;
                        afterPolygon.push(PolygonFeature_a);
                    }
                }
            }

            let nearDegreeList = {};

            beforePolygon.forEach(PolygonFeature1 => {
                const targetRoadName = PolygonFeature1.properties[objectNameCol];
                const orginialArea = PolygonFeature1.properties.area;

                afterPolygon.forEach(PolygonFeature2 => {
                    if ( targetRoadName !== PolygonFeature2.properties[objectNameCol] ) return;
                    const newDistance = PolygonFeature2.properties.distance;
                    const newArea = PolygonFeature2.properties.area;

                    const stolenRegion =  orginialArea - newArea;
                    
                    const nearDegree =  stolenRegion/(newDistance**2);
                    nearDegreeList[targetRoadName] = nearDegree;
                });
            })

            const totalSum = Object.values(nearDegreeList).reduce((sum, value) => sum + value, 0);
            const normalizedDict = {};
            for (const key in nearDegreeList) {
                if (nearDegreeList.hasOwnProperty(key)) {
                    normalizedDict[key] = nearDegreeList[key] / totalSum;
                }
            }

            let tempResult = [];
            let keys = Object.keys(normalizedDict);
            let values = Object.values(normalizedDict);
            for (let i = 0; i < keys.length; i++) {
                if (values[i] > 0.4) {
                    tempResult.push(keys[i]);
                }
            }

            //output result
            if (tempResult.length === 2) {
                // Add data to resultDistanceMiddle
                resultDistanceMiddle.features[key] = tempResult.map(name => ({
                    name: name,
                    feature: referObjectDict[key].features.find(feature => feature.properties[objectNameCol] === name)
                }));
                resultDistanceMiddle.names = [...tempResult];
            
                // Keep resultDistanceNear empty
                resultDistanceNear.features = {};
                resultDistanceNear.names = {};
            } else if (tempResult.length === 1) {
                // Add data to resultDistanceNear
                resultDistanceNear.features[key] = tempResult.map(name => ({
                    name: name,
                    feature: referObjectDict[key].features.find(feature => feature.properties[objectNameCol] === name)
                }));
                resultDistanceNear.names[key] = [...tempResult];
            
                // Keep resultDistanceMiddle empty
                resultDistanceMiddle.features = {};
                resultDistanceMiddle.names = {};
            } else {
                // Both are empty
                resultDistanceMiddle.features = {};
                resultDistanceMiddle.names = {};
                resultDistanceNear.features = {};
                resultDistanceNear.names = {};
            }
        }
    });

    return { "DistanceMiddle": resultDistanceMiddle, "DistanceNear": resultDistanceNear};
};

// 2.11 Boundary
const getCountyBoundary = (inputPt, referObjectDict, keysToConsider, threshold, countyNameCol='countyname') => {
    console.log("running getCountyBoundary...");
    const result = {};

    keysToConsider.forEach(key => {
        if (referObjectDict[key]) {
            const referObject = referObjectDict[key];
            let boundedCounty = [];

            referObject.features.forEach(feature => {
                const countyName = feature.properties[countyNameCol];
                const bufferedPt = turf.buffer(inputPt, threshold, { units: "kilometers" });
                if (turf.booleanIntersects(bufferedPt, feature)) boundedCounty.push(countyName)
            });

            if (boundedCounty.length === 2) {
                result[key] = [boundedCounty[0]+ "和" +boundedCounty[1]];
            } else {
                result[key] = [];
            }
        }
    });

    return result
};

// 2.12 Distance/Mile(for road)
const getDistance = (projectedInputPt, targetLine) => {
    console.log("running getDistance...");

    // Calculate The Distance Along Path
    const startPt = targetLine.properties.startPt;
    const startPtMile = targetLine.properties.startPt.properties.Mile;

    const split = turf.lineSlice(startPt, projectedInputPt, targetLine);
    const splitLength = turf.length(split, { units: "kilometers" });

    // Get The Mile of Input Point
    const inputPtMile = parseFloat((startPtMile + splitLength).toFixed(3)).toString()+"K";

    return { "MileStations": [inputPtMile] }
};

// 2.13 Cross(for road)
const getCross = (inputPt, referObjectDict, referColumnDict, keysToConsider, DirectionForRoad) => {
    console.log("running getCross...");

    if (!DirectionForRoad) return {};
    const { DistanceNear } = getBinaryDistanceObjectProbability(inputPt, referObjectDict, referColumnDict, keysToConsider);

    const resultCross = {};
    const resultInFront = {};

    keysToConsider.forEach(key => {
        if (Object.keys(DistanceNear['features'][key]).length !== 0) {
            if (!resultInFront[key]) resultInFront[key] = [];
            if (!resultCross[key]) resultCross[key] = [];

            const nearestObject = DistanceNear['features'][key][0]; // Assuming the first object is the nearest
            const nearestFeature = nearestObject.feature; // GeoJSON feature of the nearest object

            // Find the station point (or mile marker) of the nearest object
            const mileStations = referObjectDict["MileStation"];
            const nearestStation = findNearestPointOnMultiLineString(nearestFeature, mileStations);
            const referObjectMile = convertStringToFloat(nearestStation["point"]["properties"]["name"]);
            
            const nearestStationofInputPt = turf.nearestPoint(inputPt, mileStations);
            const inputMile = convertStringToFloat(nearestStationofInputPt["properties"]["name"]);
            
            const direction = DirectionForRoad["Route"][0];

            // Compare mile positions to determine spatial relation
            if (direction === "N") {
                if (inputMile > referObjectMile) {
                    resultInFront[key].push(nearestFeature.properties.roadname);
                } else if (inputMile > referObjectMile) {
                    resultCross[key].push(nearestFeature.properties.roadname);
                } else { return {} };
            } else if (direction === "S") {
                if (inputMile < referObjectMile) {
                    resultInFront[key].push(nearestFeature.properties.roadname);
                } else if (inputMile > referObjectMile) {
                    resultCross[key].push(nearestFeature.properties.roadname);
                } else { return {} };
            };
        }
    });
    
    return { Cross: resultCross, InFront: resultInFront };
};

// 3 Other Functions
// 3.1 Convert milestring(XXK) to float
const convertStringToFloat = (inputString) => {
    const replacedString = String(inputString).replace('K+', '.');
    const trimmedString = replacedString.replace(/^0+/, '');
    const parts = trimmedString.split('.');
    if (parts.length === 1 || parts[1].length === 0) {
        parts.push('0');
    }

    const result = parseFloat(parts.join('.'));

    return result;
};
  
router.get('/getMile', (req, res) => {
    // Read Data
    // Input(GroundFeature)
    const { x, y } = req.query;
    if (!x || !y) return res.status(400).json({ 
        status: "error", 
        message: "Both 'x' and 'y' coordinates are required." 
    }); // Check if both x and y coordinates are provided
    const inputPtArray = [x, y];
    const floatInputPtArray = inputPtArray.map(function(coord) { return parseFloat(coord); });
    const inputPt = turf.point(floatInputPtArray);
    inputPt.properties['index'] = "unknown";

    // FigureFeature(ReferObject)
    // DB Connection
    const client = new pg.Client({
        user: "TingLong",
        host: "pdb.sgis.tw",
        database: "gistl",
        password: "Acfg27354195",
        port: "5432",
    });
    
    // DB Query
    const connectAndQuery = async () => {
        try {
            await client.connect();
            console.log('Connected to PostgreSQL database');
        
            const query_county = 'SELECT id, countyname, ST_AsGeoJSON(geom) as geom FROM geospatial_description.county';
            const res_county = await client.query(query_county);
            
            const query_MileStations = 'SELECT id, name, index, ST_AsGeoJSON(geom) as geom FROM geospatial_description.milestations';
            const res_MileStations = await client.query(query_MileStations);

            const query_Route = `
                SELECT id, roadnum, ST_AsGeoJSON(geom) as geom FROM geospatial_description.hw
                UNION ALL
                SELECT id, roadnum, ST_AsGeoJSON(geom) as geom FROM geospatial_description."1w"
                UNION ALL
                SELECT id, roadnum, ST_AsGeoJSON(geom) as geom FROM geospatial_description."1e"
            `;
            const res_Route = await client.query(query_Route);

            const query_RouteAncillaryFacilities = 'SELECT id, roadnum, roadname, ST_AsGeoJSON(geom) as geom FROM geospatial_description.hu';
            const res_RouteAncillaryFacilities = await client.query(query_RouteAncillaryFacilities);

            const convertToGeoJSON = (rows, idField, additionalFields) => {
                return rows.map(row => {
                    const geom = JSON.parse(row.geom);
                    const properties = { [idField]: row[idField] };
                        additionalFields.forEach(field => {
                        properties[field] = row[field];
                    });
                    return {
                        type: 'Feature',
                        geometry: geom,
                        properties: properties
                    };
                });
            };
          
            const countyFeatures = convertToGeoJSON(res_county.rows, 'id', ['countyname']);
            const mileStationsFeatures = convertToGeoJSON(res_MileStations.rows, 'id', ['name', 'index']);
            const routeFeatures = convertToGeoJSON(res_Route.rows, 'id', ['roadnum']);
            const routeAncillaryFacilitiesFeatures = convertToGeoJSON(res_RouteAncillaryFacilities.rows, 'id', ['roadnum', 'roadname']);
        
            const countyGeoJSON = {
                type: 'FeatureCollection',
                features: countyFeatures
            };
        
            const mileStationsGeoJSON = {
                type: 'FeatureCollection',
                features: mileStationsFeatures
            };
        
            const routeGeoJSON = {
                type: 'FeatureCollection',
                features: routeFeatures
            };

            const routeAncillaryFacilitiesGeoJSON = {
                type: 'FeatureCollection',
                features: routeAncillaryFacilitiesFeatures
            };
        
            return {
                county: countyGeoJSON,
                MileStations: mileStationsGeoJSON,
                Route: routeGeoJSON,
                RouteAncillaryFacilities: routeAncillaryFacilitiesGeoJSON
            };
        } catch (err) {
            return err
        } finally {
            await client.end();
        }
    };

    // Execute DB Query
    connectAndQuery().then(dbData => {
        const roadStrings = dbData.Route; // Data- Roads
        const stationsPts = dbData.MileStations; // Data- Stations

        const initialDataJson = initialData(inputPt, roadStrings, stationsPts);
        
        // Find The Top2 Nearest Stations
        if (initialDataJson.status === "success") {
            // 1 Proprocessing Data
            const { projectedInputPt, splitLineStringsGeoJSON, targetLine, referLine, nearestPointA, nearestPointB } = initialDataJson.data;
            if (!targetLine) res.status(204).json(initialDataJson);
            const roadnum = targetLine.properties.roadnum;
            console.log("roadnum: ", roadnum);

            var roadAncillaryFacilitiesStrings = dbData.RouteAncillaryFacilities; // Data- Road Ancillary Facilities
            const countyPolygon = dbData.county; // Data- County

            // Filter road ancillary facilities by roadnum
            const filteredFeatures = roadAncillaryFacilitiesStrings.features.filter(feature => {
                return feature.properties.roadnum === roadnum;
            });
            roadAncillaryFacilitiesStrings = {
                type: 'FeatureCollection',
                features: filteredFeatures
            };

            const referObjectDict = {
                "Route": getLimitObject(inputPt, splitLineStringsGeoJSON, 4),
                "RouteAncillaryFacilities": getLimitObject(inputPt, roadAncillaryFacilitiesStrings, 4),
                "MileStation": getLimitObject(inputPt, stationsPts, 4),
                "County": getLimitObject(inputPt, countyPolygon, 4)
            }
            const referColumnDict = {
                "Route": "roadnum",
                "RouteAncillaryFacilities": "roadname",
                "MileStation": "name",
                "County": "countyname"
            }
            
            // 2 Spatial Operation
            // 2.1 Intersect
            const Intersect = getIntersectedObject(inputPt, referObjectDict, referColumnDict, ["Route", "RouteAncillaryFacilities", "County"]);

            // 2.2 Contain
            const Contain = getContainObject(inputPt, referObjectDict, referColumnDict, []);

            // 2.3 Cross
            const Cross = getCrossObject(inputPt, referObjectDict, referColumnDict, []);

            // 2.4 Disjoint
            const Disjoint = getDisjointObject(inputPt, referObjectDict, referColumnDict, []);

            // 2.5 Equal
            const Equal = getEqualObject(inputPt, referObjectDict, referColumnDict, []);

            // 2.6 Overlap
            const Overlap = getOverlapObject(inputPt, referObjectDict, referColumnDict, []);

            // 2.7 Touch 
            const Touch = getTouchObject(inputPt, referObjectDict,  referColumnDict, []); // bad rate!!!

            // 2.8 Within
            const Within = getWithinObject(inputPt, referObjectDict,  referColumnDict, ["County"]); // within multilinestring didn't work!!

            // 2.9 Direction(for road)
            const DirectionForRoad = getDirection(targetLine, referLine, nearestPointA, nearestPointB);

            // 2.10 BinaryDistance(DistanceNear/DistanceMiddle)
            const { DistanceMiddle, DistanceNear }= getBinaryDistanceObjectProbability(inputPt, referObjectDict, referColumnDict, ["RouteAncillaryFacilities"], "roadname");

            // 2.11 Boundary
            const thresholdBoundary = 1; // units: km
            const Boundary = getCountyBoundary(inputPt, referObjectDict, ["County"], thresholdBoundary);

            // 2.12 Distance/Mile(for road)
            const DistanceForRoad = getDistance(projectedInputPt, targetLine);
            
            // 2.13 Cross(for road)
            const CrossForRoad = getCross(projectedInputPt, referObjectDict, referColumnDict, ["RouteAncillaryFacilities"], DirectionForRoad);

            const SpatialOperationResult = {
                "Intersect": Intersect,
                "Contain": Contain,
                "Cross": Cross,
                "Disjoint": Disjoint,
                "Equal": Equal,
                "Overlap": Overlap,
                "Touch": Touch,
                "Within": Within,
                "DirectionForRoad": DirectionForRoad,
                "DistanceMiddle": DistanceMiddle['names'],
                "DistanceNear": DistanceNear['names'],
                "BoundaryForCounty": Boundary,
                "DistanceForRoad": DistanceForRoad,
                "CrossForRoad": CrossForRoad["Cross"],
                "InFrontForRoad": CrossForRoad["InFront"]
            }

            // 3 Output Result
            // 3.1 Result Format
            inputPt.properties = {
                "Name": "Input_Point", 
                "Mile": DistanceForRoad, 
                "Direction": DirectionForRoad,
                "index": targetLine.properties.roadnum
            };
            targetLine.properties['Name'] = "Target_Road";
            referLine.properties["Name"] = "Refer_Road";
            SpatialOperationResult.Within["Route"] = [ inputPt.properties['index'] ];
            const startPt = targetLine.properties.startPt;
            const endPt = targetLine.properties.endPt;

            const apiResult = {
                "data": {
                    "SpatialOperation": SpatialOperationResult,
                    "Geometry": {
                        "totalFeatureCollection": turf.featureCollection([ inputPt, startPt, endPt, targetLine, referLine])
                    }
                }
            };

            res.status(200).json(apiResult);
        } else { // The point is too far from roads
            res.status(400).json(initialDataJson);
        }
    }).catch(err => {
        res.status(500).json({ 
            message: "unexpected error",
            data: err 
        });
    });
});

export default router;

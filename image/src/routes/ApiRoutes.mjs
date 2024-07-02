import { Router } from 'express';
import * as turf from '@turf/turf';
import { features } from 'process';
import { promises as fs } from 'fs';

const router = Router();

const findTop2NearestRoad = (inputPt, roadStrings) => {
    let nearestPoints = [];
    roadStrings.features.forEach(line => {
        const nearestPoint = turf.nearestPointOnLine(line, inputPt, { units: "kilometers" });

        const distance = nearestPoint.properties.dist;
    
        nearestPoints.push({ line, nearestPoint, distance });
    });

    nearestPoints.sort((a, b) => a.distance - b.distance);
        
    return { 
        "top2NearestRoad": nearestPoints.slice(0, 2).map(item => item.line), 
        "top2NearestPoint": nearestPoints.slice(0, 2).map(item => item.nearestPoint)
    };
}

const getIntersectedObject = (point, multiObject, bufferRadius) => {
    const bufferedPoint = turf.buffer(point, bufferRadius, { units: 'kilometers' });

    const intersectingMultiObjectStrings = [];
    multiObject.features.forEach(feature => {
        if (turf.booleanIntersects(feature, bufferedPoint)) {
            intersectingMultiObjectStrings.push(feature);
        }
    });

    const intersectingFeaturesGeoJSON = turf.featureCollection(intersectingMultiObjectStrings);

    return intersectingFeaturesGeoJSON;
};

const initialData = (inputPt, roadStrings, stationsPts, threshold=0.2) => {
    console.log("running initialData...");
    var { top2NearestRoad, top2NearestPoint } = findTop2NearestRoad(inputPt, roadStrings);

    const inputPtToPathDistance = top2NearestPoint[0]['properties']['dist'];
    const bufferThreshold = 4;

    if (inputPtToPathDistance < threshold) {
        // Preprocessing
        const bufferedRoadStrings = getIntersectedObject(inputPt, roadStrings, bufferThreshold);
        const bufferedStationsPts = getIntersectedObject(inputPt, stationsPts, bufferThreshold);

        var projectedPoints = [];
        var splitLineStrings = [];

        let allTop2NearestPointOnRoad = {};
        
        bufferedRoadStrings.features.forEach((roadFeature, index) => {
            roadFeature.properties = { "roadIndex": index };
        });

        // Iterate through each point in the MultiPoint
        bufferedStationsPts.features.forEach(feature => {
            const coordinate = feature.geometry.coordinates;
            const mile = convertStringToFloat(feature.properties.Name);
            
            // Collect distances for each LineString
            let projectedPointsWithDistance = [];
            
            bufferedRoadStrings.features.forEach((roadFeature, index) => {
                const point = turf.point(coordinate);
                const projectedPoint = turf.nearestPointOnLine(roadFeature, point);
                const distance = turf.distance(point, projectedPoint);
                
                // Collect projected points with distances
                projectedPointsWithDistance.push({
                    "coordinates": projectedPoint.geometry.coordinates,
                    "mile": mile,
                    "distance": distance,
                    "roadFeature": roadFeature,
                    "roadIndex": index
                });
            });
        
            // Sort the projected points by distance
            projectedPointsWithDistance.sort((a, b) => a.distance - b.distance);
        
            // Get the top 2 nearest points for the current bufferedStationsPts feature
            const top2NearestPoints = projectedPointsWithDistance.slice(0, 2).map(point => ({
                "coordinates": point.coordinates,
                "roadFeature": point.roadFeature,
                "roadIndex": point.roadIndex,
                "mile": point.mile
            }));

            if (allTop2NearestPointOnRoad[top2NearestPoints[0].roadIndex] == undefined) allTop2NearestPointOnRoad[top2NearestPoints[0].roadIndex] = [];
            if (allTop2NearestPointOnRoad[top2NearestPoints[1].roadIndex] == undefined) allTop2NearestPointOnRoad[top2NearestPoints[1].roadIndex] = [];

            allTop2NearestPointOnRoad[top2NearestPoints[0].roadIndex].push(top2NearestPoints[0])
            allTop2NearestPointOnRoad[top2NearestPoints[1].roadIndex].push(top2NearestPoints[1])
        });

        // Use each pair of adjacent projected points to split the whole LineString
        bufferedRoadStrings.features.forEach(feature => {
            const roadIndex = feature.properties.roadIndex;

            for (let key in allTop2NearestPointOnRoad) {
                if (allTop2NearestPointOnRoad.hasOwnProperty(key)) {
                    const value = allTop2NearestPointOnRoad[key];
                    for (let i = 0; i < value.length - 1; i++) {
                        const startPoint = turf.point(value[i].coordinates);
                        const endPoint =  turf.point(value[i+1].coordinates);
                        startPoint.properties = {"Name": "Start_Point", "Mile": value[i].mile};
                        endPoint.properties = {"Name": "End_Point", "Mile": value[i+1].mile};

                        if (turf.booleanIntersects(turf.buffer(feature, 1, { units: "meters" }), turf.buffer(startPoint, 1, { units: "meters" }))) {
                            // Split the LineString by the pair of points
                            const lineString = turf.lineString(feature.geometry.coordinates[0]);
        
                            const split = turf.lineSlice(startPoint, endPoint, lineString);
                            split.properties = {
                                "startPt": startPoint, 
                                "endPt": endPoint,
                                "roadIndex": roadIndex // to keep track of which LineString it came from
                            };
        
                            // Collect the split LineString
                            splitLineStrings.push(split);
                        }             
                    }
                }
            }
        });

        // Convert the splitLineStrings array to GeoJSON FeatureCollection
        const splitLineStringsGeoJSON = turf.featureCollection(splitLineStrings);

        var { top2NearestRoad, top2NearestPoint } = findTop2NearestRoad(inputPt, splitLineStringsGeoJSON);

        const targetLine = top2NearestRoad[0];
        const referLine = top2NearestRoad[1];

        const referLineCoords = turf.getCoords(referLine);
        const referLineCoordsA = turf.point(referLineCoords[0]);
        const referLineCoordsB = turf.point(referLineCoords[referLineCoords.length - 1]);
    
        const nearestPointA = convertStringToFloat(turf.nearestPoint(referLineCoordsA, stationsPts).properties.Name);
        const nearestPointB = convertStringToFloat(turf.nearestPoint(referLineCoordsB, stationsPts).properties.Name);

        const projectedInputPt = top2NearestPoint[0];
 
        return {
            "status": "success",
            "data": {
                "projectedInputPt": projectedInputPt,
                "splitLineStringsGeoJSON": splitLineStringsGeoJSON,
                "targetLine": targetLine,
                "referLine": referLine,
                "nearestPointA": nearestPointA,
                "nearestPointB": nearestPointB
            }
        }
    } else {
        return {
            "status": "error",
            "message": "The input point is too far from the road."
        }
    }
};

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

const getDirection = (targetLine, referLine, nearestPointA, nearestPointB) => {
    console.log("running getDirection...");
    const maxDistance = 0.2; 
    const step = 0.001; 
    const initialDistance = 0.001; 
    const referLineCoords = turf.getCoords(referLine);
    const referLineCoordsA = turf.point(referLineCoords[0]);
    const referLineCoordsB = turf.point(referLineCoords[referLineCoords.length - 1]);

    const directions = [0, 90, 180, 270];
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
        const isToNorth = nearestPointA - nearestPointB < 0; 
        if (isToNorth) {
            const is90degree = (turf.getCoord(referLineCoordsA)[0] - turf.getCoord(referLineCoordsB)[0]) > 0; 
            if (is90degree) {
                degreeToNorth = 90;
            } else {
                degreeToNorth = 270;
            }
        } else {
            const is90degree = (turf.getCoord(referLineCoordsB)[0] - turf.getCoord(referLineCoordsA)[0]) > 0; 
            if (is90degree) {
                degreeToNorth = 90;
            } else {
                degreeToNorth = 270;
            }
        }
    } else if (targetDirection === 90 || targetDirection === 270) {
        const isToNorth = nearestPointA - nearestPointB < 0; 
        if (isToNorth) {
            const is0degree = (turf.getCoord(referLineCoordsA)[1] - turf.getCoord(referLineCoordsB)[1]) > 0; 
            if (is0degree) {
                degreeToNorth = 0;
            } else {
                degreeToNorth = 180;
            }
        } else {
            const is0degree = (turf.getCoord(referLineCoordsB)[1] - turf.getCoord(referLineCoordsA)[1]) > 0; 
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

    if (degreeToNorth === 0) {
        if (targetDirection === 90) {
            return "N";
        } else {
            return "S";
        }
    } else if (degreeToNorth > 0) {
        if (targetDirection - degreeToNorth > 0) {
            return "N";
        } else {
            return "S";
        }
    } else {
        return undefined;
    }
};

const getNearObjectProbability = (inputPt, referObjectsFeatureCollection, objectNameCol) => {
    console.log("running getNearObjectProbability...");
    inputPt.properties[objectNameCol] = "InputPt";

    let roadAncillaryFacilitiesMeanPt = [];
    referObjectsFeatureCollection.features.forEach(feature => {
        const mean = turf.centerMean(feature);
        mean.properties = feature.properties;
        roadAncillaryFacilitiesMeanPt.push(mean);
    });

    const roadAncillaryFacilitiesMeanPtCollection = turf.featureCollection(roadAncillaryFacilitiesMeanPt);
    const voronoiPolygonsOptions = {
        bbox: turf.bbox(referObjectsFeatureCollection),
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

    roadAncillaryFacilitiesMeanPtCollection.features.push(inputPt);
    const voronoiPolygons_with_inputPt = turf.voronoi(roadAncillaryFacilitiesMeanPtCollection, voronoiPolygonsOptions);
    let voronoiPolygonsOfInputPt;
    let afterPolygon = [];
    let beforePolygon = [];
    voronoiPolygons_with_inputPt.features.forEach(PolygonFeature => {
        roadAncillaryFacilitiesMeanPtCollection.features.forEach(PointFeature => {
            if (turf.booleanWithin(PointFeature, PolygonFeature)) {
                PolygonFeature.properties = PointFeature.properties;
                if (PointFeature.properties[objectNameCol] === "InputPt") voronoiPolygonsOfInputPt = PolygonFeature
                return;
            }
        });
    });

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

    // Calculate the sum of all values
    const totalSum = Object.values(nearDegreeList).reduce((sum, value) => sum + value, 0);

    // Create a new dictionary with normalized values
    const normalizedDict = {};
    for (const key in nearDegreeList) {
        if (nearDegreeList.hasOwnProperty(key)) {
            normalizedDict[key] = nearDegreeList[key] / totalSum;
        }
    }

    console.log("near probability dict: ", normalizedDict);
    return normalizedDict;
};

const getCountyBoundary = (inputPt, countyFeatureCollection, threshold, countyNameCol='COUNTYNAME') => {
    let boundedCounty = [];
    countyFeatureCollection.features.forEach(feature => {
        const countyName = feature.properties[countyNameCol];
        const bufferedPt = turf.buffer(inputPt, threshold, { units: "kilometers" });
        if (turf.booleanIntersects(bufferedPt, feature)) boundedCounty.push(countyName)
    });

    if (boundedCounty.length > 1) {
        return boundedCounty
    } else {
        return 0;
    }
};

const readData = async (file_path) => {
    try {
        const data = await fs.readFile(file_path, 'utf8');
        return data;
    } catch (err) {
        console.error('Error reading the file:', err);
    }
};
  
router.get("/", (_, res) => {
    res.status(200).json({ 
        message: "Hello, world." 
    });
});

router.get('/getMile', (req, res) => {
    const { x, y } = req.query;
    if (!x || !y) return res.status(400).json({ 
        status: "error", 
        message: "Both 'x' and 'y' coordinates are required." 
    }); // Check if both x and y coordinates are provided
    const inputPtArray = [x, y];
    const floatInputPtArray = inputPtArray.map(function(coord) {
        return parseFloat(coord);
    });
    const inputPt = turf.point(floatInputPtArray);

    // Read Data
    // Read Road GeoJSON
    var geojsonPath = './src/assets/ROAD_HW1.geojson';
    var geojsonData = readData(geojsonPath, 'utf8');
    const roadStrings = JSON.parse(geojsonData);

    // Read Station GeoJSON
    var geojsonPath = './src/assets/Stations_HW1.geojson';
    var geojsonData = readData(geojsonPath, 'utf8');
    const stationsPts = JSON.parse(geojsonData);
    const stationsNearProbabiltiy = getNearObjectProbability(inputPt, stationsPts, "Name");
    console.log(stationsNearProbabiltiy);

    const initialDataJson = initialData(inputPt, roadStrings, stationsPts);

    console.log(initialDataJson.status);
    // Find The Top2 Nearest Stations
    if (initialDataJson.status === "success") {
        // Read Road Facilities GeoJSON
        var geojsonPath = './src/assets/HUofHW1.geojson';
        var geojsonData = readData(geojsonPath, 'utf8');
        const roadAncillaryFacilitiesStrings = JSON.parse(geojsonData);
        const roadAncillaryFacilitiesNearProbabiltiy = getNearObjectProbability(inputPt, roadAncillaryFacilitiesStrings, "ROADNAME");

        // Read County GeoJSON
        var geojsonPath = './src/assets/county.geojson';
        var geojsonData = readData(geojsonPath, 'utf8');
        const thresholdBoundary = 1; // units: km
        const countyPolygon = JSON.parse(geojsonData);
        const boundedCounty = getCountyBoundary(inputPt, countyPolygon, thresholdBoundary);
        console.log("boundedCounty result: ", boundedCounty);
        // 
        const { projectedInputPt, splitLineStringsGeoJSON, targetLine, referLine, nearestPointA, nearestPointB } = initialDataJson.data;
        if (!targetLine) res.status(204).json(initialDataJson);
        // Calculate The Distance Along Path
        const startPt = targetLine.properties.startPt;
        const startPtMile = targetLine.properties.startPt.properties.Mile;
        const endPt = targetLine.properties.endPt;
        const endPtMile = targetLine.properties.endPt.properties.Mile;
        const split = turf.lineSlice(startPt, projectedInputPt, targetLine);
        const splitLength = turf.length(split, { units: "kilometers" });
        // Get The Mile of Input Point
        const inputPtMile = parseFloat((startPtMile + splitLength).toFixed(3));
        
        // Get Direction
        const direction = getDirection(targetLine, referLine, nearestPointA, nearestPointB);
        console.log("direction result: ", direction);

        inputPt.properties = {"Name": "Input_Point", "Mile": inputPtMile, "Direction": direction};

        const pathGeom = targetLine
        pathGeom.properties = {"Name": "Path_Name", "Direction": direction};
        
        targetLine.properties = {"Name": "Target_Road"}
        referLine.properties = {"Name": "Refer_Road"}
        
        // Api Result
        const apiResult = {
            "status": "success",
            "data": {
                "text": {
                    "inputPtMile": inputPtMile,
                    "direction": direction,
                    "pathName": pathGeom.properties.Name
                },
                "geometry": {
                    "totalFeatureCollection": turf.featureCollection([ inputPt, startPt, endPt, pathGeom, targetLine, referLine])
                }
            }
        };

        res.status(200).json(apiResult);
    } else {
        res.status(200).json(initialDataJson);
    }
});

export default router;

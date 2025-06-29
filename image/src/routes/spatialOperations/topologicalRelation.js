import * as turf from "@turf/turf";
import { booleanTouches } from "@turf/boolean-touches";
import { booleanContains } from "@turf/boolean-contains";

///////////////////////////////////////////////////
//
//
//   TOPOLOGY
//
//
///////////////////////////////////////////////////

// Self Defined: Within
const isWithin = (targetGeom, referGeom) => {
  // 若 target 是 FeatureCollection，檢查是否有任一個 feature 符合
  if (targetGeom.type === "FeatureCollection") {
    return targetGeom.features.some((feature) => isWithin(feature, referGeom));
  }

  // 若 refer 是 FeatureCollection，檢查是否有任一個 feature 包含 target
  if (referGeom.type === "FeatureCollection") {
    return referGeom.features.some((feature) => isWithin(targetGeom, feature));
  }

  const targetType = targetGeom.geometry.type;
  const referType = referGeom.geometry.type;

  // Point in Polygon/MultiPolygon
  if (
    targetType === "Point" &&
    (referType === "Polygon" || referType === "MultiPolygon")
  ) {
    return turf.booleanPointInPolygon(targetGeom, referGeom);
  }

  // LineString/Polygon in Polygon/MultiPolygon
  if (
    (targetType === "LineString" || targetType === "Polygon") &&
    (referType === "Polygon" || referType === "MultiPolygon")
  ) {
    return turf.booleanWithin(targetGeom, referGeom);
  }

  // FeatureCollection of points in Polygon/MultiPolygon
  if (
    targetType === "MultiPoint" &&
    (referType === "Polygon" || referType === "MultiPolygon")
  ) {
    return turf.pointsWithinPolygon(targetGeom, referGeom).features.length > 0;
  }

  // 其他類型不支援，回傳 false
  return false;
};

// All topogical relations
const spatialRelations = {
  equals: turf.booleanEqual,
  touches: booleanTouches,
  disjoint: turf.booleanDisjoint,
  contains: booleanContains,
  // covers: turf.booleanCover,
  intersects: turf.booleanIntersects,
  within: isWithin,
  crosses: turf.booleanCrosses,
  overlaps: turf.booleanOverlap,
};

// General Function to process spatial topogical relations
const processSpatialRelation = (req, res, relationFunction, relationName) => {
  try {
    const { targetGeom, referGeom } = req.body;
    if (!targetGeom || !referGeom) {
      return res.status(400).json({ error: "Missing or invalid parameters" });
    }

    if (relationFunction(targetGeom, referGeom)) {
      if (relationName !== 'Intersects') {
        res.json({ relation: relationName, geojson: referGeom });
      } else {
        const intersection = turf.intersect(targetGeom, referGeom);
        const intersectionArea = turf.area(intersection);
        res.json({ relation: relationName, other_info: intersectionArea, geojson: referGeom });
      }
    } else {
      res
        .status(404)
        .json({ error: `No ${relationName} relation found`, geojson: null });
    }
  } catch (err) {
    // Handle errors and return the error message to the frontend
    console.error(`${relationName} relation error:`, err);
    res
      .status(500)
      .json({
        error: `Failed to process ${relationName} relation`,
        details: err.message,
      });
  }
};

export { spatialRelations, processSpatialRelation };

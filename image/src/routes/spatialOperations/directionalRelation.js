import * as turf from "@turf/turf";

// Map azimuth value to direction text
function mapAzimuthToFuzzyDirection(angle, margin = 45) {
  const directions = [
    { label: "north", center: 0, margin: 30 },
    { label: "east", center: 90, margin: 60 },
    { label: "south", center: 180, margin: 30 },
    { label: "west", center: 270, margin: 60 },
  ];

  return directions
    .filter((d) => {
      const diff = Math.abs(((angle - d.center + 180 + 360) % 360) - 180);
      return diff <= d.margin;
    })
    .map((d) => d.label);
}

// Compute the spatial relation
function getAzimuth(targetGeom, referGeom) {
  const referCentroid = turf.centroid(referGeom);

  let targetEffectivePoint;

  if (targetGeom.type === "FeatureCollection") {
    if (targetGeom.features.length === 1 && targetGeom.features[0].geometry.type === "LineString") {
      targetEffectivePoint = turf.nearestPointOnLine(targetGeom.features[0], referCentroid);
    } else {
      // For other FeatureCollections, fallback to centroid of entire collection
      targetEffectivePoint = turf.centroid(targetGeom);
    }
  } else if (targetGeom.geometry) {
    const geomType = targetGeom.geometry.type;
    if (geomType === "LineString") {
      targetEffectivePoint = turf.nearestPointOnLine(targetGeom, referCentroid);
    } else if (geomType === "Point") {
      targetEffectivePoint = targetGeom;
    } else if (geomType === "Polygon" || geomType === "MultiPolygon") {
      targetEffectivePoint = turf.centroid(targetGeom);
    } else {
      // fallback for other geometry types
      targetEffectivePoint = turf.centroid(targetGeom);
    }
  } else {
    // fallback if targetGeom is a geometry object, not a Feature
    const geomType = targetGeom.type;
    if (geomType === "LineString") {
      targetEffectivePoint = turf.nearestPointOnLine(turf.feature(targetGeom), referCentroid);
    } else if (geomType === "Point") {
      targetEffectivePoint = turf.point(targetGeom.coordinates);
    } else if (geomType === "Polygon" || geomType === "MultiPolygon") {
      targetEffectivePoint = turf.centroid(turf.feature(targetGeom));
    } else {
      targetEffectivePoint = turf.centroid(turf.feature(targetGeom));
    }
  }

  let bearing = turf.bearing(referCentroid, targetEffectivePoint);
  bearing = (bearing + 360) % 360;

  return bearing;
}

export { mapAzimuthToFuzzyDirection, getAzimuth };

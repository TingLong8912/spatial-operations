import { Router } from "express";
import * as turf from "@turf/turf";
import {
  spatialRelations,
  processSpatialRelation,
} from "./spatialOperations/topologicalRelation.js";
import {
  mapAzimuthToFuzzyDirection,
  getAzimuth,
} from "./spatialOperations/directionalRelation.js";

const router = Router();

router.post("/equals", (req, res) =>
  processSpatialRelation(req, res, spatialRelations.equals, "Equals")
);

router.post("/disjoint", (req, res) =>
  processSpatialRelation(req, res, spatialRelations.disjoint, "Disjoint")
);

router.post("/touches", (req, res) =>
  processSpatialRelation(req, res, spatialRelations.touches, "Touches")
);

router.post("/contains", (req, res) =>
  processSpatialRelation(req, res, spatialRelations.contains, "Contains")
);

router.post("/covers", (req, res) =>
  processSpatialRelation(req, res, spatialRelations.covers, "Covers")
);

router.post("/intersects", (req, res) =>
  processSpatialRelation(req, res, spatialRelations.intersects, "Intersects")
);

router.post("/within", (req, res) =>
  processSpatialRelation(req, res, spatialRelations.within, "Within")
);

router.post("/crosses", (req, res) =>
  processSpatialRelation(req, res, spatialRelations.crosses, "Crosses")
);

router.post("/overlaps", (req, res) =>
  processSpatialRelation(req, res, spatialRelations.overlaps, "Overlaps")
);

router.post("/azimuth", (req, res) => {
  try {
    // Extract target geometry and reference geometry from request body
    const { targetGeom, referGeom } = req.body;

    // Validate input parameters
    if (!targetGeom || !referGeom) {
      return res.status(400).json({ error: "Missing or invalid parameters" });
    }

    const bearing = getAzimuth(targetGeom, referGeom);
    const fuzzyDirections = mapAzimuthToFuzzyDirection(bearing);

    // Return result as JSON response
    res.json({
      relation: "AbsoluteDirection",
      other_info: fuzzyDirections,
      geojson: referGeom,
      bearing: bearing,
    });
  } catch (err) {
    // Handle errors and return the error message to the frontend
    console.error(`Azimuth relation error:`, err);
    res.status(500).json({
      error: `Failed to process azimuth relation`,
      details: err.message,
    });
  }
});

export default router;

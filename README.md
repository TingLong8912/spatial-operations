# 輸入點獲得與道路相關空間物件之空間關係

## Introduction

This API allows input of a single point and, based on four reference spatial objects—road network, road facilities, road mileage markers, and county borders—generates results for 13 spatial relationships. These include the common eight topological relationships of DE-9IM, as well as custom relationships defined in this study: road direction, proximity, in betwwen, at the county border, and road mileage.

## Usage

You may append the `x=[longitude]&y=[latitude]` as a GET parameter to access the API. 

```http
GET https://getroadmile.sgis.tw/api/getMile?x=121.5710216096096&y=25.071002700355304
```

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `x` | `float` | **Required**. Your longitude to be converted |
| `y` | `float` | **Required**. Your latitude to be converted |

## Responses

Return a JSON response in the following format:

```javascript
{
    "status": text,
    "data": {
        "SpatialOperation": dict,
        "Geometry": dict
    }
}
```

The `status` field indicates the status of the API, while the `data` field is subdivided into `SpatialOperation` which represents the results of spatial operations, and `Geometry` both recorded as dictionaries.

In the dictionary recorded under `SpatialOperation` the first level records spatial relationships, the second level records the reference spatial objects, and the third level records the objects that have spatial relationships with the input point. If empty, it indicates that there are no relevant spatial objects that have a spatial relationship with the input point.

Here is an example of one of the spatial relationships:

```javascript
"Intersect": {
    "Route": [],
    "RouteAncillaryFacilities": [],
    "County": [
        "臺北市"
    ]
}
```

Under the `Geometry` field, the first level records `totalFeatureCollection`, the second level records five spatial objects are recorded, including the input point, the road the input point maps to, another road the input point maps to, and the mileage marker points before and after the input point.

You can access the `totalFeatureCollection` field under `Geometry` to retrieve the GeoJSON of the five spatial objects. This API wraps them into a FeatureCollection geometry type.
// src/swagger.js

import swaggerJSDoc from 'swagger-jsdoc';

export const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Spatial Opeartions API',
      version: '1.0.0',
      description: 'Spatial relations API for semantic location descriptions'
    },
  },
  apis: ['./routes/SpatialRoutes.js'],
};

export const swaggerSpec = swaggerJSDoc(swaggerOptions);
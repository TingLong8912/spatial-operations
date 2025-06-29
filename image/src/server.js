// src/server.js

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv-defaults';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import { router } from './routes/index.js';

const swaggerDocument = YAML.load('./docs/spatial-operation.yaml');

/* CONFIGURATIONS */
dotenv.config();
const app = express();

app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(cors());

/* ROUTES */
app.use('/', router);
console.log('Swagger paths:', swaggerDocument.paths);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log(`Server is up on port ${PORT}.`);
});
// src/server.js

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv-defaults';
import path from 'path';
import { router } from './routes/index.mjs';

/* CONFIGURATIONS */
dotenv.config();
const app = express();
app.use(express.json());

app.use(cors());

/* ROUTES */
app.use('/', router);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {console.log(`Server is up on port ${PORT}.`)});

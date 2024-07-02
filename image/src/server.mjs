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
// // DEVELOPMENT
// if (process.env.NODE_ENV === "development") app.use(cors());
// // PRODUCTION
// if (process.env.NODE_ENV === "production"){
//   const __dirname = path.resolve();
//   app.use(express.static(path.join(__dirname, "../frontend", "build")));
//   app.get("/*", function (req, res) {
//     res.sendFile(path.join(__dirname, "../frontend", "build", "index.html"))
//   });
// }

/* ROUTES */
app.use('/', router);

/* MONGOOSE SETUP */
const PORT = process.env.PORT || 4000;
// db.connect();

console.log("Server is listening on port 4000");

app.listen(PORT, () => {console.log(`Server is up on port ${PORT}.`)});

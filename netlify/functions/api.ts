// YOUR_BASE_DIRECTORY/netlify/functions/api.ts
import "dotenv/config";
// import express from "express";
import serverless from "serverless-http";
// import cors from "cors";
// import routes from "./../../src/routes";
import app from "./../../src/app";

// const app = express();
// app.use(cors());
// app.use(express.json());

// const router = Router();
// router.get("/hello", (req, res) => res.send("Hello World!"));

// app.use('/.netlify/functions/', routes);
// app.use("/", routes);

export const handler = serverless(app);
import "dotenv/config";
import express from "express";
import routes from "./routes";
import cors from "cors";

// dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/", routes);

export default app;
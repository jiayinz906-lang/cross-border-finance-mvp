import cors from "cors";
import express from "express";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { requestLogMiddleware } from "./middleware/request-log.middleware.js";
import { routes } from "./routes/index.js";

export const app = express();

app.use(cors());
app.use(express.json());
app.use(requestLogMiddleware);
app.use("/api", routes);
app.use(errorMiddleware);

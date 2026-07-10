import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { requestLogMiddleware } from "./middleware/request-log.middleware.js";
import { requireAuthToken } from "./middleware/rbac.middleware.js";
import { routes } from "./routes/index.js";

export const app = express();

app.use(cors());
app.use(express.json());
app.use(requestLogMiddleware);
app.use("/api", requireAuthToken);
app.use("/api", routes);

const clientDistPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../client/dist");

if (existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(resolve(clientDistPath, "index.html"));
  });
}

app.use(errorMiddleware);

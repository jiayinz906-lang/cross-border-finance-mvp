import { app } from "./app.js";
import { env } from "./config/env.js";

app.listen(env.port, () => {
  console.log(`cross-border-finance-server listening on port ${env.port}`);
});

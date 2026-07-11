import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("express-async-errors");

const [{ app }, { env }] = await Promise.all([
  import("./app.js"),
  import("./config/env.js")
]);

app.listen(env.port, () => {
  console.log(`cross-border-finance-server listening on port ${env.port}`);
});

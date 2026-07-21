import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { workflowService } from "../server/src/services/workflow.service.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const month = process.env.BACKUP_MONTH?.trim() || undefined;
const outputDir = path.resolve(projectRoot, process.env.BACKUP_OUTPUT_DIR || "outputs/backups");

async function main() {
  await fs.promises.mkdir(outputDir, { recursive: true });
  const file = await workflowService.exportSystemBackup(month);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = file.fileName.replace(/[^a-zA-Z0-9_.\-\u4e00-\u9fa5]/g, "_");
  const target = path.join(outputDir, `${timestamp}-${safeName}`);

  await fs.promises.writeFile(target, file.buffer);

  console.log("System backup exported.");
  console.log(`Scope: ${month ?? "all months"}`);
  console.log(`File: ${target}`);
  console.log(`Size: ${file.buffer.length} bytes`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { authService } from "../server/src/services/auth.service.js";
import { resetBusinessData } from "../server/src/services/business-reset.service.js";
import { prisma } from "../server/src/prisma/client.js";

async function main() {
  await authService.login("admin", "admin123");
  const result = await resetBusinessData("system-reset-script", "本地初始化全新业务数据库");
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

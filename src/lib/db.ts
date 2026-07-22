import { PrismaClient } from "@prisma/client";

import { dataPaths } from "@/lib/data-paths";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const databaseUrl = `file:${dataPaths.database}`;

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

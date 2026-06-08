import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 vyžaduje driver adapter. Naše tabulky žijí ve schématu "dms".
const connectionString = process.env.DATABASE_URL;

const createPrismaClient = () => {
  const adapter = new PrismaPg(
    { connectionString },
    { schema: "dms" },
  );
  return new PrismaClient({ adapter });
};

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

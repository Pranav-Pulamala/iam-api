import { PrismaClient } from '@prisma/client';
import { PERMISSION_DEFINITIONS } from '../src/modules/authorization/permissions.js';

const prisma = new PrismaClient();

const seed = async (): Promise<void> => {
  for (const permission of PERMISSION_DEFINITIONS) {
    await prisma.permission.upsert({
      where: {
        key: permission.key,
      },
      update: {
        description: permission.description,
      },
      create: permission,
    });
  }

  process.stdout.write(`Seeded ${String(PERMISSION_DEFINITIONS.length)} permission definitions.\n`);
};

try {
  await seed();
} catch (error: unknown) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);

  process.stderr.write(`Permission seed failed: ${message}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

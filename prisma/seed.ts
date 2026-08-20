import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const permissions = [
  {
    key: 'organization:read',
    description: 'View organization information.',
  },
  {
    key: 'organization:update',
    description: 'Update organization information.',
  },
  {
    key: 'member:read',
    description: 'View organization members.',
  },
  {
    key: 'member:add',
    description: 'Add organization members.',
  },
  {
    key: 'member:remove',
    description: 'Remove organization members.',
  },
  {
    key: 'role:read',
    description: 'View organization roles.',
  },
  {
    key: 'role:create',
    description: 'Create organization roles.',
  },
  {
    key: 'role:update',
    description: 'Update organization roles.',
  },
  {
    key: 'role:delete',
    description: 'Delete organization roles.',
  },
  {
    key: 'role:assign',
    description: 'Assign roles to organization members.',
  },
  {
    key: 'permission:read',
    description: 'View available permission definitions.',
  },
] as const;

const seed = async (): Promise<void> => {
  for (const permission of permissions) {
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

  process.stdout.write(`Seeded ${String(permissions.length)} permission definitions.\n`);
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

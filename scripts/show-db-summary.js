import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function showDbSummary() {
  const businesses = await prisma.businesses.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      business_email: true,
      business_phone: true,
      city: true,
      state: true,
      business_members: {
        select: {
          role: true,
          users: {
            select: {
              email: true,
              name: true,
              is_super_admin: true,
            },
          },
        },
      },
      subscription_orders: {
        select: {
          id: true,
          status: true,
          plans: {
            select: {
              code: true,
              name: true,
            },
          },
        },
      },
    },
  });

  console.log('\n--- ACTIVE BRIDAL STUDIOS IN DB ---');
  console.log(JSON.stringify(businesses, null, 2));

  const users = await prisma.users.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      is_super_admin: true,
    },
  });

  console.log('\n--- ACTIVE USERS IN DB ---');
  console.log(JSON.stringify(users, null, 2));
}

showDbSummary()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });

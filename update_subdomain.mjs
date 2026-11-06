import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.business_websites.update({
    where: { business_id: '7ada4abc-ae21-45b7-9ce5-63538d80e5f0' },
    data: { subdomain: 'srinivaskasbridalstudio' }
  });
  console.log('Successfully updated website subdomain:', updated.subdomain);
}

main().catch(console.error).finally(() => prisma.$disconnect());


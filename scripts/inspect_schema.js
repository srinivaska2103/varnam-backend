import prisma from '../src/config/prisma.js';

async function main() {
  const cols = await prisma.$queryRawUnsafe("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'bookings'");
  console.log('Bookings columns:', cols.map(c => `${c.column_name} (${c.data_type})`));
  
  const enums = await prisma.$queryRawUnsafe("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'payment_status'");
  console.log('Payment status enum:', enums.map(e => e.enumlabel));
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

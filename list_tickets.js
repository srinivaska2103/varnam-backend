import prisma from './src/config/prisma.js';

async function main() {
  const tickets = await prisma.support_tickets.findMany();
  console.log('Total tickets:', tickets.length);
  for (const t of tickets) {
    console.log(JSON.stringify({ id: t.id, number: t.ticket_number, business_id: t.business_id, user_id: t.user_id, subject: t.subject }));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());


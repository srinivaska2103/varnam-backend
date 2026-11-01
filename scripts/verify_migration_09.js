import prisma from '../src/config/prisma.js';

async function verify() {
  const configs = await prisma.$queryRawUnsafe(`SELECT * FROM whatsapp_billing_configs`);
  console.log('WhatsApp Billing Configs:', configs);

  const rules = await prisma.$queryRawUnsafe(`SELECT * FROM whatsapp_pricing_rules`);
  console.log('WhatsApp Pricing Rules count:', rules.length);
  rules.forEach(r => {
    console.log(` - ${r.country_code} [${r.message_category}]: Base ₹${r.base_rate_rupees}, Tax ${r.tax_rate_percent}%, Total ₹${r.total_rate_rupees}`);
  });

  const cols = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'whatsapp_credit_transactions'
  `);
  console.log('Columns in whatsapp_credit_transactions:', cols);

  const businesses = await prisma.businesses.findMany({ select: { id: true, name: true, slug: true } });
  console.log('Existing businesses:', businesses);

  await prisma.$disconnect();
}

verify().catch(console.error);

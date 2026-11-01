import prisma from '../src/config/prisma.js';

async function checkPlans() {
  try {
    const plans = await prisma.plans.findMany({
      include: { plan_features: true },
    });
    console.log('PLANS_COUNT:', plans.length);
    console.log(JSON.stringify(plans, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkPlans();

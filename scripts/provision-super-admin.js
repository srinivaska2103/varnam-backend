import prisma from '../src/config/prisma.js';
import bcrypt from 'bcryptjs';

async function provisionSuperAdmin() {
  const adminEmail = (process.env.SUPER_ADMIN_EMAIL || process.env.SUBSCRIPTION_ADMIN_EMAIL || 'vexatech.connect@gmail.com').toLowerCase().trim();

  console.log(`Checking super admin status for platform emails...`);

  // 1. Revoke super admin privileges from any non-authorized accounts
  await prisma.users.updateMany({
    where: {
      email: { not: adminEmail },
      is_super_admin: true,
    },
    data: { is_super_admin: false }
  });
  console.log(`🔒 Revoked super admin access from all other emails`);

  // 2. Ensure platform owner email vexatech.connect@gmail.com exists with Super Admin
  const adminUser = await prisma.users.findUnique({ where: { email: adminEmail } });
  if (!adminUser) {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('VexaTech@2026', salt);

    const created = await prisma.users.create({
      data: {
        name: 'Varnam Super Admin',
        email: adminEmail,
        password_hash: passwordHash,
        is_email_verified: true,
        is_active: true,
        is_super_admin: true,
      }
    });
    console.log(`✅ Provisioned default platform super admin account: ${adminEmail} (ID: ${created.id})`);
  } else {
    await prisma.users.update({
      where: { id: adminUser.id },
      data: { is_super_admin: true, is_active: true }
    });
    console.log(`✅ Updated ${adminEmail} to is_super_admin = true`);
  }

  const superAdmins = await prisma.users.findMany({
    where: { is_super_admin: true },
    select: { id: true, name: true, email: true, is_super_admin: true }
  });
  console.log('Current authorized Super Admin in database:', superAdmins);

  await prisma.$disconnect();
}

provisionSuperAdmin().catch(e => {
  console.error(e);
  process.exit(1);
});

import 'dotenv/config';
import { transporter } from '../src/config/mailer.js';

async function testSmtp() {
  console.log('Testing SMTP connection with GoDaddy/secureserver.net...');
  try {
    const verified = await transporter.verify();
    console.log('✅ SMTP transporter.verify() SUCCEEDED:', verified);
  } catch (error) {
    console.error('❌ SMTP transporter.verify() FAILED:', error.message);
  }
}

testSmtp();

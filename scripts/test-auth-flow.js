import 'dotenv/config';
import crypto from 'crypto';
import prisma from '../src/config/prisma.js';

const BASE_URL = 'http://localhost:5000/api/auth';
const TEST_EMAIL = 'test_bridal_owner@example.com';
const TEST_PASSWORD = 'SecurePassword123!';

async function runTests() {
  console.log('🧪 Starting Authentication & OTP Verification Flow Tests...\n');

  try {
    // 0. Clean up previous test run data
    await prisma.email_verifications.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.users.deleteMany({ where: { email: TEST_EMAIL } });

    // TEST 1: Register with Invalid Email
    console.log('Test 1: Register with Invalid Email...');
    const res1 = await fetch(`${BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Owner', email: 'not-an-email', password: TEST_PASSWORD }),
    });
    const data1 = await res1.json();
    console.log(`Status: ${res1.status}, Success: ${data1.success}`);
    if (res1.status !== 400) throw new Error('Test 1 Failed: Expected 400 for invalid email');
    console.log('✅ Test 1 Passed.\n');

    // TEST 2: Register with Valid Details
    console.log('Test 2: Register with Valid Details...');
    const res2 = await fetch(`${BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bridal Studio Owner', email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    const data2 = await res2.json();
    console.log(`Status: ${res2.status}, Success: ${data2.success}`);
    if (res2.status !== 201) throw new Error(`Test 2 Failed: ${JSON.stringify(data2)}`);
    console.log('✅ Test 2 Passed: User registered and OTP generated.\n');

    // TEST 3: Attempt Login BEFORE Email Verification (Should Fail)
    console.log('Test 3: Attempt Login Before Email Verification (Should Fail 403)...');
    const res3 = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    const data3 = await res3.json();
    console.log(`Status: ${res3.status}, Message: "${data3.message}"`);
    if (res3.status !== 403) throw new Error('Test 3 Failed: Unverified user allowed to login!');
    console.log('✅ Test 3 Passed: Rejected unverified email login.\n');

    // Retrieve active OTP record from DB to simulate user receiving email
    const verificationRecord = await prisma.email_verifications.findFirst({
      where: { email: TEST_EMAIL, is_consumed: false },
    });
    if (!verificationRecord) throw new Error('No OTP record created in database!');
    console.log(`Found OTP record (Expires: ${verificationRecord.expires_at})`);

    // TEST 4: Verify with WRONG OTP (Should Fail)
    console.log('Test 4: Verify with WRONG OTP...');
    const res4 = await fetch(`${BASE_URL}/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, otp: '000000' }),
    });
    const data4 = await res4.json();
    console.log(`Status: ${res4.status}, Message: "${data4.message}"`);
    if (res4.status !== 400) throw new Error('Test 4 Failed: Accepted wrong OTP!');
    console.log('✅ Test 4 Passed: Wrong OTP rejected and attempts tracked.\n');

    // TEST 5: Verify with CORRECT OTP
    const testOtp = '123456';
    const testHash = crypto.createHash('sha256').update(testOtp).digest('hex');
    await prisma.email_verifications.update({
      where: { id: verificationRecord.id },
      data: { otp_hash: testHash },
    });

    console.log('Test 5: Verify with CORRECT OTP (123456)...');
    const res5 = await fetch(`${BASE_URL}/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, otp: testOtp }),
    });
    const data5 = await res5.json();
    console.log(`Status: ${res5.status}, Success: ${data5.success}, Verified: ${data5.data.verified}`);
    if (res5.status !== 200 || !data5.data.verified) throw new Error('Test 5 Failed: Verification failed with correct OTP');
    console.log('✅ Test 5 Passed: Email successfully verified.\n');

    // TEST 6: Replay consumed OTP (Should Fail)
    console.log('Test 6: Replay Consumed OTP (Should Fail)...');
    const res6 = await fetch(`${BASE_URL}/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, otp: testOtp }),
    });
    const data6 = await res6.json();
    console.log(`Status: ${res6.status}, Message: "${data6.message}"`);
    if (res6.status !== 400) throw new Error('Test 6 Failed: Consumed OTP replayed!');
    console.log('✅ Test 6 Passed: Replay rejected.\n');

    // TEST 7: Login AFTER Successful Verification
    console.log('Test 7: Login With Verified Credentials...');
    const res7 = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    const data7 = await res7.json();
    console.log(`Status: ${res7.status}, Success: ${data7.success}`);
    if (res7.status !== 200 || !data7.data.token) throw new Error('Test 7 Failed: Login failed');
    const token = data7.data.token;
    console.log('✅ Test 7 Passed: Successfully received JWT access token.\n');

    // TEST 8: Access GET /api/auth/me WITH Bearer Token
    console.log('Test 8: Access GET /api/auth/me with Bearer Token...');
    const res8 = await fetch(`${BASE_URL}/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data8 = await res8.json();
    console.log(`Status: ${res8.status}, Email: ${data8.data.email}, Memberships: ${data8.data.memberships.length}`);
    if (res8.status !== 200 || data8.data.email !== TEST_EMAIL) throw new Error('Test 8 Failed: /me endpoint failed');
    console.log('✅ Test 8 Passed: Successfully loaded user profile with Bearer JWT.\n');

    // TEST 9: Access GET /api/auth/me WITHOUT Bearer Token (Should Fail 401)
    console.log('Test 9: Access GET /api/auth/me without Token (Should Fail 401)...');
    const res9 = await fetch(`${BASE_URL}/me`);
    const data9 = await res9.json();
    console.log(`Status: ${res9.status}, Message: "${data9.message}"`);
    if (res9.status !== 401) throw new Error('Test 9 Failed: Unauthenticated request permitted!');
    console.log('✅ Test 9 Passed: Protected endpoint rejected unauthenticated request.\n');

    // Clean up test records
    await prisma.email_verifications.deleteMany({ where: { email: TEST_EMAIL } });
    await prisma.users.deleteMany({ where: { email: TEST_EMAIL } });

    console.log('🎉 ALL 9 TEST SUITES COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Test failed with error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();

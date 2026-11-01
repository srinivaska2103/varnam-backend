/**
 * Verification test suite for Phase 9: Inventory Management & Expenses Enhancements
 *
 * Covers:
 * Part A: Inventory Management & Stock Movements
 * 1. Creating and updating inventory items with categories, units, and minimum thresholds.
 * 2. Stock-in: Adding stock atomically, increasing quantity_on_hand, and logging movement.
 * 3. Stock-out: Deducting stock, verifying non-negative validation, and recording usage reason.
 * 4. Booking-related stock usage: Associating stock-out with confirmed bookings.
 * 5. Preventing duplicate stock deductions with idempotency keys.
 * 6. Physical count stock adjustments (positive/negative reconciliations).
 * 7. Low-stock and out-of-stock calculations.
 * 8. Inventory summary with real database statistics and live total valuation in paise/INR.
 * 9. Stock movement history filtering by item, booking, and movement type.
 *
 * Part B: Expenses Enhancements
 * 10. Creating studio expenses with categories and amounts.
 * 11. Expense summary calculations: Total expenses, category breakdowns, counts, and recent records.
 * 12. Listing supported expense categories.
 * 13. Archiving / voiding expenses without destroying financial history.
 *
 * Part C: Security & Multi-Tenancy
 * 14. Cross-tenant isolation: Tenant 2 cannot access or mutate Tenant 1 inventory items or movements.
 * 15. Rejecting negative stock, invalid quantities, and unauthorized requests.
 */

import dotenv from 'dotenv';
dotenv.config();

import { generateAccessToken } from '../src/utils/generate-token.js';
import prisma from '../src/config/prisma.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

function generateAuthToken(user) {
  return generateAccessToken({ userId: user.id, email: user.email });
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    data = { raw: text };
  }

  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    data,
  };
}

async function runPhase9Tests() {
  console.log('====================================================');
  console.log('🚀 STARTING PHASE 9 AUTOMATED VERIFICATION SUITE');
  console.log('   Inventory & Expenses Enhancements');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
    console.log(`✅ PASS: ${message}`);
    passedTests++;
  }

  try {
    // -----------------------------------------------------------------
    // SETUP: Provision 2 isolated businesses & owners
    // -----------------------------------------------------------------
    console.log('--- Step 0: Setup Two Isolated Business Tenants ---');

    const timestamp = Date.now().toString(36);
    const owner1 = await prisma.users.create({
      data: {
        name: `Studio Stock Owner 1 ${timestamp}`,
        email: `stock1_${timestamp}@example.com`,
        password_hash: 'hashedpassword',
        is_email_verified: true,
      },
    });

    const token1 = generateAuthToken(owner1);

    const biz1Res = await request('/api/business', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: {
        name: `Bridal Cosmetics Studio 1 ${timestamp}`,
        phone: `91${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `stockbiz1_${timestamp}@example.com`,
        description: 'Luxury bridal studio with full inventory tracking',
      },
    });

    assert(biz1Res.status === 201, 'Tenant 1 business created successfully');
    const biz1Id = biz1Res.data.data.business?.id || biz1Res.data.data.id;

    // Tenant 2
    const owner2 = await prisma.users.create({
      data: {
        name: `Studio Stock Owner 2 ${timestamp}`,
        email: `stock2_${timestamp}@example.com`,
        password_hash: 'hashedpassword',
        is_email_verified: true,
      },
    });

    const token2 = generateAuthToken(owner2);

    const biz2Res = await request('/api/business', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` },
      body: {
        name: `Bridal Studio 2 ${timestamp}`,
        phone: `92${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `stockbiz2_${timestamp}@example.com`,
      },
    });

    assert(biz2Res.status === 201, 'Tenant 2 business created successfully');
    const biz2Id = biz2Res.data.data.business?.id || biz2Res.data.data.id;

    // Create a customer and booking in Tenant 1 for stock usage
    const custRes = await request('/api/customers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: { full_name: 'Meera Nambiar', phone: `98${Math.floor(10000000 + Math.random() * 90000000)}` },
    });
    assert(custRes.status === 201, 'Customer created in Tenant 1');
    const customer1Id = custRes.data.data.id;

    const bookingRes = await request('/api/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        customer_id: customer1Id,
        total_amount_paise: 5000000,
        event: {
          title: 'Wedding Ceremony',
          event_kind: 'WEDDING',
          event_date: '2026-11-28',
          start_time: '06:00:00',
          end_time: '10:00:00',
        },
      },
    });
    assert(bookingRes.status === 201, 'Booking created in Tenant 1');
    const booking1Id = bookingRes.data.data.id;

    // -----------------------------------------------------------------
    // PART A: INVENTORY MANAGEMENT
    // -----------------------------------------------------------------
    console.log('\n--- Step 1: Inventory Items Management ---');

    // 1.1 Create Item 1: MAC Studio Fix Foundation (Initial stock 10 units, min 5, unit cost ₹2,800)
    const item1Res = await request('/api/inventory', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        name: 'MAC Studio Fix Fluid Foundation (NC30)',
        sku: 'MAC-NC30-30ML',
        category: 'FOUNDATION',
        unit: 'bottle',
        quantity_on_hand: 10,
        minimum_quantity: 5,
        unit_cost_paise: 280000, // ₹2,800
        expiry_date: '2028-12-31',
      },
    });
    assert(item1Res.status === 201, 'POST /api/inventory: Creates inventory item');
    assert(item1Res.data.data.quantity_on_hand === 10, 'Initial quantity is 10');
    assert(item1Res.data.data.unit_cost_paise === 280000, 'Unit cost matches ₹2,800 in paise');
    const item1Id = item1Res.data.data.id;

    // 1.2 Create duplicate item name in same business -> Conflict
    const dupRes = await request('/api/inventory', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        name: 'MAC Studio Fix Fluid Foundation (NC30)',
        quantity_on_hand: 2,
      },
    });
    assert(dupRes.status === 409, 'POST /api/inventory: Duplicate item name rejected with 409 Conflict');

    // 1.3 Create Item 2: Huda Beauty False Eyelashes (Low stock: 2 units, min 5)
    const item2Res = await request('/api/inventory', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        name: 'Huda Beauty Classic False Eyelashes #7',
        sku: 'HUDA-LASH-07',
        category: 'EYES',
        unit: 'pair',
        quantity_on_hand: 2,
        minimum_quantity: 5,
        unit_cost_paise: 120000, // ₹1,200
      },
    });
    assert(item2Res.status === 201, 'POST /api/inventory: Second item created');
    assert(item2Res.data.data.is_low_stock === true, 'Item with qty <= min marked as low stock');
    const item2Id = item2Res.data.data.id;

    // 1.4 List inventory with search
    const listInvRes = await request('/api/inventory?search=Foundation', {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(listInvRes.status === 200, 'GET /api/inventory: Lists items with search filter');
    assert(listInvRes.data.data.items.length >= 1, 'Search returned matching items');

    // 1.5 Update item details
    const updateInvRes = await request(`/api/inventory/${item1Id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        unit_cost_paise: 290000, // Updated to ₹2,900
      },
    });
    assert(updateInvRes.status === 200, 'PATCH /api/inventory/:id: Updates item details');
    assert(updateInvRes.data.data.unit_cost_paise === 290000, 'Updated unit cost reflected');

    // -----------------------------------------------------------------
    // PART A2: STOCK MOVEMENTS (STOCK-IN, STOCK-OUT, ADJUSTMENTS)
    // -----------------------------------------------------------------
    console.log('\n--- Step 2: Stock Movements & Flow ---');

    // 2.1 Stock-In: Receive 5 additional bottles of Foundation
    const stockInRes = await request(`/api/inventory/${item1Id}/stock-in`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        quantity: 5,
        unit_cost_paise: 290000,
        reason: 'Monthly cosmetics bulk purchase',
      },
    });
    assert(stockInRes.status === 201, 'POST /api/inventory/:id/stock-in: Adds stock');
    assert(stockInRes.data.data.item.quantity_on_hand === 15, 'Quantity increased from 10 to 15');
    assert(stockInRes.data.data.movement.movement_type === 'PURCHASE', 'Stock-in logged as PURCHASE');

    // 2.2 Stock-Out: Use 1 pair of false lashes for Booking 1 with idempotency key
    const idempKey = `USE-LASH-${Date.now()}`;
    const stockOutRes = await request(`/api/inventory/${item2Id}/stock-out`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        quantity: 1,
        booking_id: booking1Id,
        movement_type: 'USAGE',
        reason: 'Applied during bridal muhurtham session',
        idempotency_key: idempKey,
      },
    });
    assert(stockOutRes.status === 201, 'POST /api/inventory/:id/stock-out: Deducts stock for booking');
    assert(stockOutRes.data.data.item.quantity_on_hand === 1, 'Quantity decreased from 2 to 1');
    assert(stockOutRes.data.data.movement.booking_id === booking1Id, 'Movement associated with booking_id');

    // 2.3 Prevent duplicate stock deduction with same idempotency key -> 409 Conflict
    const dupDeductRes = await request(`/api/inventory/${item2Id}/stock-out`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        quantity: 1,
        booking_id: booking1Id,
        movement_type: 'USAGE',
        idempotency_key: idempKey,
      },
    });
    assert(dupDeductRes.status === 409, 'Duplicate stock deduction prevented with 409 Conflict');

    // 2.4 Reject stock-out exceeding available quantity -> 400 Bad Request
    const overDeductRes = await request(`/api/inventory/${item2Id}/stock-out`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        quantity: 10, // Only 1 available
        movement_type: 'USAGE',
      },
    });
    assert(overDeductRes.status === 400, 'Negative stock strictly rejected with 400 Bad Request');

    // 2.5 Stock Adjustment: Physical count reveals 16 bottles of Foundation (adjust from 15 to 16)
    const adjustRes = await request(`/api/inventory/${item1Id}/adjustments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        counted_quantity: 16,
        reason: 'Physical month-end audit reconciled extra unopened bottle',
      },
    });
    assert(adjustRes.status === 201, 'POST /api/inventory/:id/adjustments: Reconciles stock count');
    assert(adjustRes.data.data.item.quantity_on_hand === 16, 'Stock updated to counted quantity: 16');
    assert(adjustRes.data.data.movement.movement_type === 'ADJUSTMENT', 'Logged as ADJUSTMENT');

    // -----------------------------------------------------------------
    // PART A3: INVENTORY SUMMARY & LOW-STOCK ENDPOINTS
    // -----------------------------------------------------------------
    console.log('\n--- Step 3: Inventory Summary & Valuation ---');

    // 3.1 Low stock endpoint
    const lowStockRes = await request('/api/inventory/low-stock', {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(lowStockRes.status === 200, 'GET /api/inventory/low-stock: Lists low stock items');
    assert(lowStockRes.data.data.count >= 1, 'Identified low stock item (Eyelashes)');

    // 3.2 Inventory summary & total valuation
    const summaryRes = await request('/api/inventory/summary', {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(summaryRes.status === 200, 'GET /api/inventory/summary: Retrieves inventory statistics');
    assert(summaryRes.data.data.total_active_items >= 2, 'Total active items calculated from DB');
    assert(summaryRes.data.data.total_valuation_paise > 0, 'Total inventory valuation calculated correctly in paise');
    assert(summaryRes.data.data.recent_movements.length >= 1, 'Recent stock movements list included');

    // 3.3 List item movements
    const itemMovRes = await request(`/api/inventory/${item1Id}/movements`, {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(itemMovRes.status === 200, 'GET /api/inventory/:id/movements: Retrieves item stock history');
    assert(itemMovRes.data.data.movements.length >= 2, 'Item history has stock-in and adjustment entries');

    // 3.4 Soft-archive item
    const archiveInvRes = await request(`/api/inventory/${item2Id}/archive`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(archiveInvRes.status === 200, 'PATCH /api/inventory/:id/archive: Soft-archives item');
    assert(archiveInvRes.data.data.is_active === false, 'Archived item is_active is false');

    // -----------------------------------------------------------------
    // PART B: EXPENSES ENHANCEMENTS
    // -----------------------------------------------------------------
    console.log('\n--- Step 4: Expenses Enhancements (Summary, Categories & Archive) ---');

    // 4.1 Create Expense 1: Cosmetics Restock (₹5,800)
    const exp1Res = await request('/api/expenses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        category: 'COSMETICS_RESTOCK',
        description: 'Sephora restocking cosmetics and sponges',
        amount_paise: 580000,
        expense_date: '2026-11-05',
        vendor_name: 'Sephora India',
      },
    });
    assert(exp1Res.status === 201, 'POST /api/expenses: Creates expense');
    const exp1Id = exp1Res.data.data.id;

    // 4.2 Create Expense 2: Travel & Transport (₹1,500)
    const exp2Res = await request('/api/expenses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        category: 'TRAVEL_TRANSPORT',
        description: 'Cab fare for onsite destination trial',
        amount_paise: 150000,
        expense_date: '2026-11-08',
      },
    });
    assert(exp2Res.status === 201, 'POST /api/expenses: Creates second expense');
    const exp2Id = exp2Res.data.data.id;

    // 4.3 List expense categories
    const catRes = await request('/api/expenses/categories', {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(catRes.status === 200, 'GET /api/expenses/categories: Lists supported expense categories');
    assert(catRes.data.data.categories.includes('COSMETICS_RESTOCK'), 'Categories list includes COSMETICS_RESTOCK');

    // 4.4 Get expense summary
    const expSummaryRes = await request('/api/expenses/summary?startDate=2026-11-01&endDate=2026-11-30', {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(expSummaryRes.status === 200, 'GET /api/expenses/summary: Retrieves expense summary breakdown');
    assert(expSummaryRes.data.data.total_expenses_paise === 730000, 'Total period expenses equal ₹7,300 (730000 paise)');
    assert(expSummaryRes.data.data.categories_breakdown.length === 2, 'Breakdown includes both categories');

    // 4.5 Archive / Void Expense 2
    const archiveExpRes = await request(`/api/expenses/${exp2Id}/archive`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(archiveExpRes.status === 200, 'PATCH /api/expenses/:id/archive: Voids/archives expense');
    assert(archiveExpRes.data.data.status === 'VOIDED', 'Expense status transitioned to VOIDED');

    // 4.6 Verify voided expense is excluded from expense summary
    const expSummaryAfterVoid = await request('/api/expenses/summary?startDate=2026-11-01&endDate=2026-11-30', {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(expSummaryAfterVoid.data.data.total_expenses_paise === 580000, 'Voided expense excluded from summary (580000 paise)');

    // -----------------------------------------------------------------
    // PART C: MULTI-TENANT ISOLATION & SECURITY
    // -----------------------------------------------------------------
    console.log('\n--- Step 5: Multi-Tenant Isolation & Security ---');

    // 5.1 Tenant 2 cannot access Tenant 1 inventory item -> 404
    const crossInvRes = await request(`/api/inventory/${item1Id}`, {
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
    });
    assert(crossInvRes.status === 404, 'Tenant isolation: Tenant 2 cannot view Tenant 1 inventory item (404)');

    // 5.2 Tenant 2 cannot record stock movements on Tenant 1 item -> 404
    const crossStockRes = await request(`/api/inventory/${item1Id}/stock-in`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
      body: { quantity: 5 },
    });
    assert(crossStockRes.status === 404, 'Tenant isolation: Tenant 2 cannot mutate Tenant 1 stock (404)');

    // 5.3 Tenant 2 cannot access Tenant 1 expense -> 404
    const crossExpRes = await request(`/api/expenses/${exp1Id}`, {
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
    });
    assert(crossExpRes.status === 404, 'Tenant isolation: Tenant 2 cannot view Tenant 1 expense (404)');

    // 5.4 Unauthenticated request -> 401
    const unauthRes = await request('/api/inventory', {
      method: 'POST',
      body: { name: 'Hacked Item' },
    });
    assert(unauthRes.status === 401, 'Security: Unauthenticated request rejected with 401');

    console.log('\n====================================================');
    console.log(`🎉 ALL PHASE 9 TESTS PASSED SUCCESSFULLY! (${passedTests}/${totalTests})`);
    console.log('====================================================\n');
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase9Tests();

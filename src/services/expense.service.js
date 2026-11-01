import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

export const expenseService = {
  /**
   * Record a new expense for the business
   */
  async createExpense(businessId, userId, data) {
    const amountPaise = BigInt(data.amount_paise);
    if (amountPaise <= BigInt(0)) {
      throw ApiError.badRequest('Expense amount must be greater than zero');
    }

    const expenseDate = data.expense_date
      ? new Date(`${data.expense_date}T00:00:00.000Z`)
      : new Date();

    const expense = await prisma.expenses.create({
      data: {
        business_id: businessId,
        category: data.category,
        description: data.description,
        amount_paise: amountPaise,
        expense_date: expenseDate,
        vendor_name: data.vendor_name || null,
        receipt_url: data.receipt_url || null,
        notes: data.notes || null,
        status: data.status || 'RECORDED',
        recorded_by: userId,
      },
      include: {
        users: { select: { id: true, name: true } },
      },
    });

    return {
      ...expense,
      amount_paise: Number(expense.amount_paise),
      expense_date: expense.expense_date.toISOString().split('T')[0],
      recorded_by_name: expense.users?.name || 'Studio Staff',
      users: undefined,
    };
  },

  /**
   * List expenses with category and date filters
   */
  async listExpenses(businessId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = {
      business_id: businessId,
    };

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { description: { contains: term, mode: 'insensitive' } },
        { vendor_name: { contains: term, mode: 'insensitive' } },
        { category: { contains: term, mode: 'insensitive' } },
        { notes: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query.category) {
      where.category = { contains: query.category, mode: 'insensitive' };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate || query.endDate) {
      where.expense_date = {
        ...(query.startDate ? { gte: new Date(`${query.startDate}T00:00:00.000Z`) } : {}),
        ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) } : {}),
      };
    }

    const sortBy = query.sortBy || 'expense_date';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [total, expenses] = await prisma.$transaction([
      prisma.expenses.count({ where }),
      prisma.expenses.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          users: { select: { id: true, name: true } },
        },
      }),
    ]);

    const formatted = expenses.map((e) => ({
      id: e.id,
      category: e.category,
      description: e.description,
      amount_paise: Number(e.amount_paise),
      expense_date: e.expense_date.toISOString().split('T')[0],
      vendor_name: e.vendor_name,
      receipt_url: e.receipt_url,
      status: e.status,
      notes: e.notes,
      recorded_by: e.users?.name || null,
      created_at: e.created_at,
    }));

    return {
      expenses: formatted,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get single expense details
   */
  async getExpenseById(businessId, expenseId) {
    const expense = await prisma.expenses.findFirst({
      where: {
        id: expenseId,
        business_id: businessId,
      },
      include: {
        users: { select: { id: true, name: true } },
      },
    });

    if (!expense) {
      throw ApiError.notFound('Expense record not found in this business');
    }

    return {
      ...expense,
      amount_paise: Number(expense.amount_paise),
      expense_date: expense.expense_date.toISOString().split('T')[0],
      recorded_by: expense.users?.name || null,
      users: undefined,
    };
  },

  /**
   * Update permitted expense fields
   */
  async updateExpense(businessId, expenseId, data) {
    const existing = await prisma.expenses.findFirst({
      where: {
        id: expenseId,
        business_id: businessId,
      },
    });

    if (!existing) {
      throw ApiError.notFound('Expense record not found in this business');
    }

    const updated = await prisma.expenses.update({
      where: { id: expenseId },
      data: {
        category: data.category !== undefined ? data.category : existing.category,
        description: data.description !== undefined ? data.description : existing.description,
        amount_paise: data.amount_paise !== undefined ? BigInt(data.amount_paise) : existing.amount_paise,
        expense_date: data.expense_date ? new Date(`${data.expense_date}T00:00:00.000Z`) : existing.expense_date,
        vendor_name: data.vendor_name !== undefined ? data.vendor_name : existing.vendor_name,
        receipt_url: data.receipt_url !== undefined ? data.receipt_url : existing.receipt_url,
        notes: data.notes !== undefined ? data.notes : existing.notes,
        status: data.status !== undefined ? data.status : existing.status,
      },
    });

    return {
      ...updated,
      amount_paise: Number(updated.amount_paise),
      expense_date: updated.expense_date.toISOString().split('T')[0],
    };
  },

  /**
   * Archive / Void an expense record
   */
  async archiveExpense(businessId, expenseId) {
    const existing = await prisma.expenses.findFirst({
      where: { id: expenseId, business_id: businessId },
    });

    if (!existing) {
      throw ApiError.notFound('Expense record not found in this business');
    }

    const updated = await prisma.expenses.update({
      where: { id: expenseId },
      data: { status: 'VOIDED' },
    });

    return {
      ...updated,
      amount_paise: Number(updated.amount_paise),
      expense_date: updated.expense_date.toISOString().split('T')[0],
      archived: true,
    };
  },

  /**
   * Delete an expense permanently
   */
  async deleteExpense(businessId, expenseId) {
    const existing = await prisma.expenses.findFirst({
      where: { id: expenseId, business_id: businessId },
    });

    if (!existing) {
      throw ApiError.notFound('Expense record not found in this business');
    }

    await prisma.expenses.delete({
      where: { id: expenseId },
    });

    return {
      id: expenseId,
      deleted: true,
    };
  },

  /**
   * Get expense summary, categories aggregation, monthly totals, and recent expenses
   */
  async getExpenseSummary(businessId, query = {}) {
    const where = {
      business_id: businessId,
      status: { not: 'VOIDED' }, // Exclude voided expenses from accounting calculations
    };

    if (query.startDate || query.endDate) {
      where.expense_date = {
        ...(query.startDate ? { gte: new Date(`${query.startDate}T00:00:00.000Z`) } : {}),
        ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) } : {}),
      };
    }

    if (query.category) {
      where.category = { contains: query.category, mode: 'insensitive' };
    }

    // 1. Total expenses in period
    const totalAgg = await prisma.expenses.aggregate({
      where,
      _sum: { amount_paise: true },
      _count: { id: true },
    });

    const totalExpensesPaise = totalAgg._sum.amount_paise ? Number(totalAgg._sum.amount_paise) : 0;
    const totalCount = totalAgg._count.id;

    // 2. Breakdown by category
    const categoryGroups = await prisma.expenses.groupBy({
      by: ['category'],
      where,
      _sum: { amount_paise: true },
      _count: { id: true },
      orderBy: { _sum: { amount_paise: 'desc' } },
    });

    // 2b. Current calendar month calculation
    const now = new Date();
    const startOfCurrentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const endOfCurrentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const thisMonthAgg = await prisma.expenses.aggregate({
      where: {
        business_id: businessId,
        status: { not: 'VOIDED' },
        expense_date: {
          gte: startOfCurrentMonth,
          lte: endOfCurrentMonth,
        },
      },
      _sum: { amount_paise: true },
      _count: { id: true },
    });
    const thisMonthExpensesPaise = thisMonthAgg._sum.amount_paise ? Number(thisMonthAgg._sum.amount_paise) : 0;

    // 2c. Voided / Archived count for transparency
    const voidedCount = await prisma.expenses.count({
      where: {
        business_id: businessId,
        status: 'VOIDED',
      },
    });

    const categoryBreakdown = categoryGroups.map((g) => ({
      category: g.category,
      total_amount_paise: g._sum.amount_paise ? Number(g._sum.amount_paise) : 0,
      total_amount_inr: ((g._sum.amount_paise ? Number(g._sum.amount_paise) : 0) / 100).toFixed(2),
      count: g._count.id,
      percentage_of_total: totalExpensesPaise > 0
        ? Number((((g._sum.amount_paise ? Number(g._sum.amount_paise) : 0) / totalExpensesPaise) * 100).toFixed(1))
        : 0,
    }));

    const highestCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;

    // 3. Recent expenses in period
    const recentExpenses = await prisma.expenses.findMany({
      where,
      take: 5,
      orderBy: { expense_date: 'desc' },
      include: { users: { select: { id: true, name: true } } },
    });

    return {
      period: {
        startDate: query.startDate || 'all_time',
        endDate: query.endDate || 'all_time',
      },
      total_expenses_paise: totalExpensesPaise,
      total_expenses_inr: (totalExpensesPaise / 100).toFixed(2),
      this_month_expenses_paise: thisMonthExpensesPaise,
      this_month_expenses_inr: (thisMonthExpensesPaise / 100).toFixed(2),
      highest_category: highestCategory,
      total_records: totalCount,
      voided_records: voidedCount,
      categories_breakdown: categoryBreakdown,
      recent_expenses: recentExpenses.map((e) => ({
        id: e.id,
        category: e.category,
        description: e.description,
        amount_paise: Number(e.amount_paise),
        expense_date: e.expense_date.toISOString().split('T')[0],
        vendor_name: e.vendor_name,
        recorded_by: e.users?.name || null,
      })),
    };
  },

  /**
   * List supported and commonly used studio expense categories
   */
  async getExpenseCategories(businessId) {
    const defaultCategories = [
      'Makeup Products',
      'Cosmetics & Skincare',
      'Brushes & Tools',
      'Hair Styling Products',
      'Saree Draping Supplies',
      'Travel & Transportation',
      'Studio Rent',
      'Utilities',
      'Staff Payments',
      'Training & Education',
      'Marketing & Advertising',
      'Equipment',
      'Other',
    ];

    // Find any custom categories existing in this business
    const existing = await prisma.expenses.findMany({
      where: { business_id: businessId },
      select: { category: true },
      distinct: ['category'],
    });

    const customCategories = existing.map((e) => e.category).filter(Boolean);
    const combined = Array.from(new Set([...defaultCategories, ...customCategories]));

    return {
      categories: combined,
    };
  },
};


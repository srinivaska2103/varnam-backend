import { Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { notificationService } from './notification.service.js';
import { emailTemplates } from '../utils/emailTemplates.js';
import { APP_CONFIG } from '../config/appConfig.js';
import { env } from '../config/env.js';

export const inventoryService = {
  /**
   * Create an inventory item
   */
  async createItem(businessId, data) {
    // Check name uniqueness in business
    const existingName = await prisma.inventory_items.findUnique({
      where: {
        business_id_name: {
          business_id: businessId,
          name: data.name,
        },
      },
    });

    if (existingName) {
      throw ApiError.conflict(`An inventory item with name "${data.name}" already exists`);
    }

    if (data.sku) {
      const existingSku = await prisma.inventory_items.findUnique({
        where: {
          business_id_sku: {
            business_id: businessId,
            sku: data.sku,
          },
        },
      });
      if (existingSku) {
        throw ApiError.conflict(`An inventory item with SKU "${data.sku}" already exists`);
      }
    }

    const item = await prisma.inventory_items.create({
      data: {
        business_id: businessId,
        name: data.name,
        sku: data.sku || null,
        category: data.category || null,
        unit: data.unit || 'unit',
        quantity_on_hand: new Prisma.Decimal(data.quantity_on_hand || 0),
        minimum_quantity: new Prisma.Decimal(data.minimum_quantity || 0),
        unit_cost_paise: BigInt(data.unit_cost_paise || 0),
        expiry_date: data.expiry_date ? new Date(`${data.expiry_date}T00:00:00.000Z`) : null,
        is_active: data.is_active !== undefined ? data.is_active : true,
      },
    });

    return this.serializeItem(item);
  },

  /**
   * List inventory items with pagination, search, category, and low stock filters
   */
  async listItems(businessId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = { business_id: businessId };

    if (query.is_active !== undefined) {
      where.is_active = typeof query.is_active === 'string'
        ? query.is_active.toLowerCase() === 'true'
        : Boolean(query.is_active);
    }

    if (query.category) {
      where.category = { contains: query.category, mode: 'insensitive' };
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { sku: { contains: term, mode: 'insensitive' } },
        { category: { contains: term, mode: 'insensitive' } },
      ];
    }

    let orderBy = [{ is_active: 'desc' }, { name: 'asc' }];
    if (query.sortBy === 'name') {
      orderBy = [{ name: query.sortOrder === 'desc' ? 'desc' : 'asc' }];
    } else if (query.sortBy === 'quantity') {
      orderBy = [{ quantity_on_hand: query.sortOrder === 'asc' ? 'asc' : 'desc' }];
    } else if (query.sortBy === 'updated_at' || query.sortBy === 'recent') {
      orderBy = [{ updated_at: 'desc' }];
    } else if (query.sortBy === 'created_at') {
      orderBy = [{ created_at: 'desc' }];
    }

    const [total, items] = await Promise.all([
      prisma.inventory_items.count({ where }),
      prisma.inventory_items.findMany({
        where,
        skip,
        take: limit,
        orderBy,
      }),
    ]);

    let serialized = items.map((i) => this.serializeItem(i));

    if (query.low_stock_only) {
      serialized = serialized.filter((i) => i.is_low_stock);
    }
    if (query.stock_status === 'out_of_stock') {
      serialized = serialized.filter((i) => i.is_out_of_stock);
    } else if (query.stock_status === 'low_stock') {
      serialized = serialized.filter((i) => i.is_low_stock && !i.is_out_of_stock);
    } else if (query.stock_status === 'in_stock') {
      serialized = serialized.filter((i) => !i.is_low_stock && !i.is_out_of_stock);
    }

    return {
      items: serialized,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get inventory item details by ID
   */
  async getItemById(businessId, itemId) {
    const item = await prisma.inventory_items.findFirst({
      where: {
        id: itemId,
        business_id: businessId,
      },
      include: {
        stock_movements: {
          take: 10,
          orderBy: { created_at: 'desc' },
          include: {
            users: { select: { id: true, name: true } },
            bookings: { select: { id: true, booking_number: true } },
          },
        },
      },
    });

    if (!item) {
      throw ApiError.notFound('Inventory item not found in this business');
    }

    return this.serializeItem(item);
  },

  /**
   * Update inventory item details
   */
  async updateItem(businessId, itemId, data) {
    await this.getItemById(businessId, itemId);

    if (data.name) {
      const dup = await prisma.inventory_items.findFirst({
        where: {
          business_id: businessId,
          name: data.name,
          id: { not: itemId },
        },
      });
      if (dup) throw ApiError.conflict(`Another item named "${data.name}" already exists`);
    }

    if (data.sku) {
      const dupSku = await prisma.inventory_items.findFirst({
        where: {
          business_id: businessId,
          sku: data.sku,
          id: { not: itemId },
        },
      });
      if (dupSku) throw ApiError.conflict(`Another item with SKU "${data.sku}" already exists`);
    }

    const updated = await prisma.inventory_items.update({
      where: { id: itemId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.sku !== undefined ? { sku: data.sku } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.unit !== undefined ? { unit: data.unit } : {}),
        ...(data.minimum_quantity !== undefined ? { minimum_quantity: new Prisma.Decimal(data.minimum_quantity) } : {}),
        ...(data.unit_cost_paise !== undefined ? { unit_cost_paise: BigInt(data.unit_cost_paise) } : {}),
        ...(data.expiry_date !== undefined ? { expiry_date: data.expiry_date ? new Date(`${data.expiry_date}T00:00:00.000Z`) : null } : {}),
        ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
      },
    });

    return this.serializeItem(updated);
  },

  /**
   * Archive inventory item (soft-delete via is_active = false)
   */
  async archiveItem(businessId, itemId) {
    await this.getItemById(businessId, itemId);

    const updated = await prisma.inventory_items.update({
      where: { id: itemId },
      data: { is_active: false },
    });

    return {
      ...this.serializeItem(updated),
      archived: true,
    };
  },

  /**
   * Delete inventory item (if stock movements exist, cascade or archive)
   */
  async deleteItem(businessId, itemId) {
    await this.getItemById(businessId, itemId);

    // Delete related stock movements first to satisfy foreign key or use transaction
    await prisma.$transaction(async (tx) => {
      await tx.stock_movements.deleteMany({
        where: { inventory_item_id: itemId, business_id: businessId },
      });
      await tx.inventory_items.delete({
        where: { id: itemId },
      });
    });

    return { success: true, message: 'Inventory item deleted successfully' };
  },

  /**
   * List low stock items (quantity_on_hand <= minimum_quantity)
   */
  async getLowStockItems(businessId) {
    const items = await prisma.inventory_items.findMany({
      where: {
        business_id: businessId,
        is_active: true,
      },
      orderBy: { name: 'asc' },
    });

    const lowStock = items
      .map((i) => this.serializeItem(i))
      .filter((i) => i.is_low_stock);

    return {
      count: lowStock.length,
      items: lowStock,
    };
  },

  /**
   * Record Stock-In (Purchase or restocking)
   */
  async recordStockIn(businessId, userId, itemId, data) {
    const qtyToAdd = Number(data.quantity);
    if (qtyToAdd <= 0) {
      throw ApiError.badRequest('Stock-in quantity must be greater than zero');
    }

    const item = await prisma.inventory_items.findFirst({
      where: { id: itemId, business_id: businessId },
    });

    if (!item) {
      throw ApiError.notFound('Inventory item not found');
    }

    const unitCostPaise = data.unit_cost_paise !== undefined ? BigInt(data.unit_cost_paise) : item.unit_cost_paise;

    // Atomically increment quantity and record movement
    const result = await prisma.$transaction(async (tx) => {
      const currentQty = Number(item.quantity_on_hand);
      const newQty = currentQty + qtyToAdd;

      const updatedItem = await tx.inventory_items.update({
        where: { id: itemId },
        data: {
          quantity_on_hand: new Prisma.Decimal(newQty),
          ...(data.unit_cost_paise !== undefined ? { unit_cost_paise: BigInt(data.unit_cost_paise) } : {}),
        },
      });

      const movement = await tx.stock_movements.create({
        data: {
          business_id: businessId,
          inventory_item_id: itemId,
          movement_type: 'PURCHASE',
          quantity_change: new Prisma.Decimal(qtyToAdd),
          unit_cost_paise: unitCostPaise,
          reason: data.reason || 'Restocking inventory',
          recorded_by: userId,
        },
      });

      return { item: updatedItem, movement };
    });

    return {
      message: `Successfully added ${qtyToAdd} ${item.unit} to stock`,
      item: this.serializeItem(result.item),
      movement: this.serializeMovement(result.movement),
    };
  },

  /**
   * Record Stock-Out (Usage, waste, or consumption for booking)
   */
  async recordStockOut(businessId, userId, itemId, data) {
    const qtyToRemove = Number(data.quantity);
    if (qtyToRemove <= 0) {
      throw ApiError.badRequest('Stock-out quantity must be greater than zero');
    }

    const item = await prisma.inventory_items.findFirst({
      where: { id: itemId, business_id: businessId },
    });

    if (!item) {
      throw ApiError.notFound('Inventory item not found');
    }

    // Validate booking if linked
    if (data.booking_id) {
      const booking = await prisma.bookings.findFirst({
        where: { id: data.booking_id, business_id: businessId },
      });
      if (!booking) {
        throw ApiError.badRequest('Referenced booking does not exist in your business');
      }

      // Check for duplicate deduction if idempotency_key or exact reason with booking
      if (data.idempotency_key) {
        const existingMovement = await prisma.stock_movements.findFirst({
          where: {
            business_id: businessId,
            inventory_item_id: itemId,
            booking_id: data.booking_id,
            reason: { contains: `[IDEMP:${data.idempotency_key}]` },
          },
        });
        if (existingMovement) {
          throw ApiError.conflict('Stock usage for this operation has already been recorded');
        }
      }
    }

    // Atomically decrement stock ensuring non-negative balance
    const result = await prisma.$transaction(async (tx) => {
      const currentItem = await tx.inventory_items.findUnique({
        where: { id: itemId },
      });

      const currentQty = Number(currentItem.quantity_on_hand);
      if (currentQty < qtyToRemove) {
        throw ApiError.badRequest(
          `Insufficient stock. Available: ${currentQty} ${currentItem.unit}, requested to remove: ${qtyToRemove} ${currentItem.unit}`
        );
      }

      const newQty = currentQty - qtyToRemove;

      const updatedItem = await tx.inventory_items.update({
        where: { id: itemId },
        data: {
          quantity_on_hand: new Prisma.Decimal(newQty),
        },
      });

      let finalReason = data.reason || (data.booking_id ? 'Consumed for wedding appointment' : 'Stock usage');
      if (data.idempotency_key) {
        finalReason = `${finalReason} [IDEMP:${data.idempotency_key}]`;
      }

      const movement = await tx.stock_movements.create({
        data: {
          business_id: businessId,
          inventory_item_id: itemId,
          movement_type: data.movement_type || 'USAGE',
          quantity_change: new Prisma.Decimal(-qtyToRemove),
          unit_cost_paise: currentItem.unit_cost_paise,
          reason: finalReason,
          booking_id: data.booking_id || null,
          recorded_by: userId,
        },
      });

      return { item: updatedItem, movement };
    });

    // Check low stock alert after deduction:
    // Only fire if item was previously healthy (> minQty) or no active alert exists for this low-stock state
    try {
      const prevQty = Number(item.quantity_on_hand);
      const remainingQty = Number(result.item.quantity_on_hand);
      const minQty = Number(result.item.minimum_quantity);

      if (remainingQty <= minQty) {
        // Only trigger an alert if stock was previously above threshold (fresh transition)
        // or no low-stock notification has been queued for this item since it dropped
        const alreadyAlerted = prevQty <= minQty;
        if (!alreadyAlerted) {
          const biz = await prisma.businesses.findUnique({
            where: { id: businessId },
            select: { business_email: true, name: true, slug: true },
          });

          if (biz?.business_email) {
            const inventoryUrl = APP_CONFIG.getStudioAdminUrl(biz.slug, 'expenses');
            const emailTpl = emailTemplates.lowStockAlert({
              itemName: result.item.name,
              currentQuantity: remainingQty,
              minimumThreshold: minQty,
              inventoryUrl,
              businessName: biz.name,
            });

            await notificationService.triggerEventNotification({
              businessId,
              eventKey: 'LOW_STOCK_ALERT',
              recipientEmail: biz.business_email,
              subject: emailTpl.subject,
              htmlBody: emailTpl.html,
              idempotencyKey: `lowstock-${result.item.id}-${Date.now()}`,
            });
          }
        }
      }
    } catch (notifErr) {
      console.warn('⚠️ Non-fatal notification error on low stock:', notifErr.message);
    }

    return {
      message: `Successfully deducted ${qtyToRemove} ${item.unit} from stock`,
      item: this.serializeItem(result.item),
      movement: this.serializeMovement(result.movement),
    };
  },

  /**
   * Correct stock after physical count (Adjustment)
   */
  async recordStockAdjustment(businessId, userId, itemId, data) {
    const countedQty = Number(data.counted_quantity);
    if (countedQty < 0) {
      throw ApiError.badRequest('Counted quantity cannot be negative');
    }

    const item = await prisma.inventory_items.findFirst({
      where: { id: itemId, business_id: businessId },
    });

    if (!item) {
      throw ApiError.notFound('Inventory item not found');
    }

    const result = await prisma.$transaction(async (tx) => {
      const currentItem = await tx.inventory_items.findUnique({
        where: { id: itemId },
      });

      const currentQty = Number(currentItem.quantity_on_hand);
      const diff = countedQty - currentQty;

      const updatedItem = await tx.inventory_items.update({
        where: { id: itemId },
        data: {
          quantity_on_hand: new Prisma.Decimal(countedQty),
        },
      });

      const movement = await tx.stock_movements.create({
        data: {
          business_id: businessId,
          inventory_item_id: itemId,
          movement_type: 'ADJUSTMENT',
          quantity_change: new Prisma.Decimal(diff),
          unit_cost_paise: currentItem.unit_cost_paise,
          reason: `Physical count audit: Adjusted from ${currentQty} to ${countedQty}. Reason: ${data.reason}`,
          recorded_by: userId,
        },
      });

      return { item: updatedItem, movement };
    });

    return {
      message: `Stock successfully adjusted to ${countedQty} ${item.unit}`,
      item: this.serializeItem(result.item),
      movement: this.serializeMovement(result.movement),
    };
  },

  /**
   * List stock movements across business with filters
   */
  async listMovements(businessId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = { business_id: businessId };

    if (query.inventory_item_id) {
      where.inventory_item_id = query.inventory_item_id;
    }
    if (query.movement_type) {
      where.movement_type = query.movement_type;
    }
    if (query.booking_id) {
      where.booking_id = query.booking_id;
    }

    if (query.startDate || query.endDate) {
      where.created_at = {};
      if (query.startDate) where.created_at.gte = new Date(`${query.startDate}T00:00:00.000Z`);
      if (query.endDate) where.created_at.lte = new Date(`${query.endDate}T23:59:59.999Z`);
    }

    const [total, movements] = await Promise.all([
      prisma.stock_movements.count({ where }),
      prisma.stock_movements.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          inventory_items: {
            select: { id: true, name: true, unit: true, sku: true },
          },
          bookings: {
            select: { id: true, booking_number: true },
          },
          users: {
            select: { id: true, name: true },
          },
        },
      }),
    ]);

    return {
      movements: movements.map((m) => this.serializeMovement(m)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Item specific movement history
   */
  async getItemMovements(businessId, itemId, query = {}) {
    await this.getItemById(businessId, itemId);
    return this.listMovements(businessId, { ...query, inventory_item_id: itemId });
  },

  /**
   * Real database inventory statistics & valuation
   */
  async getInventorySummary(businessId) {
    const items = await prisma.inventory_items.findMany({
      where: { business_id: businessId },
    });

    let totalActiveItems = 0;
    let totalUnits = 0;
    let lowStockItemsCount = 0;
    let outOfStockCount = 0;
    let totalValuationPaise = BigInt(0);

    for (const item of items) {
      if (item.is_active) {
        totalActiveItems++;
        const qty = Number(item.quantity_on_hand);
        const minQty = Number(item.minimum_quantity);
        totalUnits += qty;

        if (qty <= 0) {
          outOfStockCount++;
        }
        if (qty <= minQty) {
          lowStockItemsCount++;
        }

        // Valuation: quantity * unit_cost_paise
        const itemValuation = BigInt(Math.round(qty * Number(item.unit_cost_paise)));
        totalValuationPaise += itemValuation;
      }
    }

    // Recent 5 movements
    const recentMovements = await prisma.stock_movements.findMany({
      where: { business_id: businessId },
      take: 5,
      orderBy: { created_at: 'desc' },
      include: {
        inventory_items: { select: { id: true, name: true, unit: true } },
      },
    });

    return {
      total_items: items.length,
      total_products: totalActiveItems,
      total_active_items: totalActiveItems,
      total_units: Math.round(totalUnits * 100) / 100,
      low_stock_count: lowStockItemsCount,
      out_of_stock_count: outOfStockCount,
      total_valuation_paise: Number(totalValuationPaise),
      total_valuation_inr: (Number(totalValuationPaise) / 100).toFixed(2),
      recent_movements: recentMovements.map((m) => this.serializeMovement(m)),
    };
  },

  /**
   * Serialization Helpers
   */
  serializeItem(item) {
    if (!item) return null;
    const qty = Number(item.quantity_on_hand);
    const minQty = Number(item.minimum_quantity);
    const cost = Number(item.unit_cost_paise);

    return {
      ...item,
      quantity_on_hand: qty,
      minimum_quantity: minQty,
      unit_cost_paise: cost,
      is_low_stock: item.is_active && qty <= minQty,
      is_out_of_stock: item.is_active && qty <= 0,
      stock_movements: item.stock_movements ? item.stock_movements.map((m) => this.serializeMovement(m)) : undefined,
    };
  },

  serializeMovement(m) {
    if (!m) return null;
    return {
      ...m,
      quantity_change: Number(m.quantity_change),
      unit_cost_paise: m.unit_cost_paise ? Number(m.unit_cost_paise) : null,
      recorded_by: m.users?.name || null,
      users: undefined,
    };
  },
};

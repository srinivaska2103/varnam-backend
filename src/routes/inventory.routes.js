import { Router } from 'express';
import { inventoryController } from '../controllers/inventory.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireBusinessMembership } from '../middleware/business.middleware.js';
import { requireEntitlement } from '../middleware/entitlement.middleware.js';
import { validateRequest } from '../middleware/validate.js';
import {
  createInventoryItemSchema,
  updateInventoryItemSchema,
  listInventoryQuerySchema,
  stockInSchema,
  stockOutSchema,
  stockAdjustmentSchema,
  listMovementsQuerySchema,
} from '../validators/inventory.validator.js';

const router = Router();

// All inventory routes require authentication, business membership, and INVENTORY_MANAGEMENT entitlement
router.use(authenticate);
router.use(requireBusinessMembership());
router.use(requireEntitlement('INVENTORY_MANAGEMENT'));

/**
 * Static / Aggregate routes (mounted before :id)
 */
router.get(
  '/summary',
  inventoryController.getSummary
);

router.get(
  '/low-stock',
  inventoryController.getLowStockItems
);

router.get(
  '/movements',
  validateRequest(listMovementsQuerySchema, 'query'),
  inventoryController.listMovements
);

/**
 * Collection endpoints
 */
router.post(
  '/',
  validateRequest(createInventoryItemSchema),
  inventoryController.createItem
);

router.get(
  '/',
  validateRequest(listInventoryQuerySchema, 'query'),
  inventoryController.listItems
);

/**
 * Specific item endpoints
 */
router.get('/:id', inventoryController.getItemById);

router.patch(
  '/:id',
  validateRequest(updateInventoryItemSchema),
  inventoryController.updateItem
);

router.patch(
  '/:id/archive',
  inventoryController.archiveItem
);

router.delete(
  '/:id',
  inventoryController.deleteItem
);

router.post(
  '/:id/stock-in',
  validateRequest(stockInSchema),
  inventoryController.recordStockIn
);

router.post(
  '/:id/stock-out',
  validateRequest(stockOutSchema),
  inventoryController.recordStockOut
);

router.post(
  '/:id/adjustments',
  validateRequest(stockAdjustmentSchema),
  inventoryController.recordStockAdjustment
);

router.get(
  '/:id/movements',
  validateRequest(listMovementsQuerySchema, 'query'),
  inventoryController.getItemMovements
);

export default router;

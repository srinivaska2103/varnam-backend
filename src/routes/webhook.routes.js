import { Router } from 'express';
import prisma from '../config/prisma.js';
import { whatsappService } from '../services/whatsapp.service.js';

const router = Router();

/**
 * GET /api/webhooks/whatsapp
 * Meta WhatsApp Cloud API Webhook Verification Challenge
 */
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || 'varnam_whatsapp_verify_token';

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('[WhatsApp Webhook] Verification challenge passed successfully.');
    return res.status(200).send(challenge);
  }

  console.warn('[WhatsApp Webhook] Verification token mismatch.');
  return res.status(403).json({ error: 'Verification token mismatch' });
});

/**
 * POST /api/webhooks/whatsapp
 * Meta WhatsApp Cloud API Event Notifications (sent, delivered, read, failed)
 */
router.post('/whatsapp', async (req, res) => {
  try {
    const payload = req.body;
    await whatsappService.handleWebhookPayload(payload, prisma);
    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[WhatsApp Webhook] Handler error:', err.message);
    return res.status(200).json({ status: 'error_logged' }); // Acknowledge to prevent WhatsApp retry flood
  }
});

export default router;


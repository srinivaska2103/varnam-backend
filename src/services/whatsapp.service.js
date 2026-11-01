import axios from 'axios';
import { env } from '../config/env.js';
import { WHATSAPP_TEMPLATES, getWhatsAppTemplate } from '../utils/whatsappTemplates.js';

export const whatsappService = {
  /**
   * Normalizes an Indian or International phone number to E.164 digits format (no spaces, hyphens, or leading +)
   */
  normalizePhoneNumber(phone) {
    if (!phone) return null;
    let digits = String(phone).replace(/\D/g, '');
    if (!digits) return null;

    // Handle Indian 10-digit mobile starting with 6,7,8,9
    if (digits.length === 10 && /^[6-9]/.test(digits)) {
      digits = `91${digits}`;
    } else if (digits.length === 11 && digits.startsWith('0')) {
      digits = `91${digits.slice(1)}`;
    }
    return digits;
  },

  /**
   * Checks whether the WhatsApp Cloud API provider is configured with credentials
   */
  isConfigured() {
    return Boolean(
      (process.env.WHATSAPP_PHONE_NUMBER_ID || env.WHATSAPP_PHONE_NUMBER_ID) &&
      (process.env.WHATSAPP_ACCESS_TOKEN || env.WHATSAPP_ACCESS_TOKEN)
    );
  },

  /**
   * Dispatches a WhatsApp message using Cloud API or simulated mode in development
   *
   * @param {Object} options
   * @param {string} options.to - Recipient phone number
   * @param {string} options.templateKey - One of WHATSAPP_TEMPLATES keys or Meta template names
   * @param {Object} options.params - Resolved key-value parameters
   * @param {string} [options.fallbackText] - Pre-rendered text message
   */
  async sendMessage({ to, templateKey, params = {}, fallbackText = null }) {
    const normalizedPhone = this.normalizePhoneNumber(to);
    if (!normalizedPhone) {
      throw new Error(`Invalid recipient phone number: ${to}. Expected valid 10-digit mobile or international E.164 format.`);
    }

    // Resolves by uppercase key or lowercase Meta templateName
    const tplConfig = getWhatsAppTemplate(templateKey);
    const textBody = fallbackText || (tplConfig ? tplConfig.format(params) : '');

    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || env.WHATSAPP_ACCESS_TOKEN;
    const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || env.WHATSAPP_GRAPH_API_VERSION || 'v20.0';

    // Development simulation mode if credentials not provided
    if (!phoneNumberId || !accessToken) {
      console.log(`[WhatsApp Simulated Mode] To: +${normalizedPhone} | Template: ${tplConfig?.templateName || 'TEXT'}`);
      return {
        success: true,
        provider_message_id: `sim_wa_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        status: 'SENT',
        simulated: true,
        recipient: normalizedPhone,
        text_preview: textBody,
      };
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    // 1. Dispatch as Meta Official Template if template configured
    if (tplConfig?.templateName) {
      try {
        const components = [];

        // Build Header parameters if template expects header named params (e.g. new_enquiry_notification)
        if (tplConfig.headerParams && tplConfig.headerParams.length > 0) {
          const headerParameters = tplConfig.headerParams.map((paramKey) => ({
            type: 'text',
            parameter_name: paramKey,
            text: String(params[paramKey] ?? ''),
          }));
          components.push({
            type: 'header',
            parameters: headerParameters,
          });
        }

        // Build Body named parameters in exact approved specification
        const bodyParamKeys = tplConfig.requiredParams && tplConfig.requiredParams.length > 0
          ? tplConfig.requiredParams
          : Object.keys(params);

        const bodyParameters = bodyParamKeys.map((paramKey) => ({
          type: 'text',
          parameter_name: paramKey,
          text: String(params[paramKey] ?? ''),
        }));

        if (bodyParameters.length > 0) {
          components.push({
            type: 'body',
            parameters: bodyParameters,
          });
        }

        const payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizedPhone,
          type: 'template',
          template: {
            name: tplConfig.templateName,
            language: { code: tplConfig.language || 'en' },
            components: components.length > 0 ? components : undefined,
          },
        };

        const response = await axios.post(url, payload, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        });

        const messageId = response.data?.messages?.[0]?.id || `wamid.${Date.now()}`;
        console.log(`[WhatsApp Cloud API Success] Template "${tplConfig.templateName}" delivered to +${normalizedPhone} (ID: ${messageId})`);

        return {
          success: true,
          provider_message_id: messageId,
          status: 'SENT',
          simulated: false,
          recipient: normalizedPhone,
          raw_response: response.data,
        };
      } catch (err) {
        const errData = err.response?.data?.error;
        const errCode = errData?.code;
        const errDetail = errData?.message || err.message;
        const errorSubcode = errData?.error_subcode;

        console.error(`[WhatsApp API Error] Template "${tplConfig.templateName}" failed to +${normalizedPhone} (code ${errCode}, subcode ${errorSubcode}):`, errDetail);

        let userFriendlyMsg = errDetail;
        if (errCode === 132001) {
          userFriendlyMsg = `Template "${tplConfig.templateName}" (${tplConfig.language || 'en'}) is not available in WABA. Verify template approval status.`;
        } else if (errCode === 100) {
          userFriendlyMsg = `Invalid template parameters or component structure for "${tplConfig.templateName}": ${errData?.error_data?.details || errDetail}`;
        } else if (errCode === 190) {
          userFriendlyMsg = 'WhatsApp System User Access Token is invalid or expired.';
        } else if (errCode === 131030) {
          userFriendlyMsg = 'Recipient phone number is not a valid WhatsApp registered account.';
        } else if (errCode === 130429) {
          userFriendlyMsg = 'WhatsApp Cloud API rate limit reached. Please retry in a few moments.';
        }

        throw new Error(`WhatsApp delivery failed: ${userFriendlyMsg}`);
      }
    }

    // 2. Direct Text Dispatch (for non-template customer support / direct notifications)
    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedPhone,
        type: 'text',
        text: { body: textBody },
      };

      const res = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      const messageId = res.data?.messages?.[0]?.id || `wamid.${Date.now()}`;
      return {
        success: true,
        provider_message_id: messageId,
        status: 'SENT',
        simulated: false,
        recipient: normalizedPhone,
        raw_response: res.data,
      };
    } catch (textErr) {
      const errDetail = textErr.response?.data?.error?.message || textErr.message;
      console.error(`[WhatsApp API Error] Direct text to +${normalizedPhone} failed:`, errDetail);
      throw new Error(`WhatsApp delivery failed: ${errDetail}`);
    }
  },

  /**
   * Diagnostic inspection helper to verify credentials, WABA, Phone Number, and registered templates
   */
  async runDiagnostics() {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || env.WHATSAPP_PHONE_NUMBER_ID;
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || env.WHATSAPP_ACCESS_TOKEN;
    const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || env.WHATSAPP_GRAPH_API_VERSION || 'v20.0';

    if (!phoneNumberId || !accessToken || !wabaId) {
      return {
        configured: false,
        error: 'Missing required WhatsApp credentials in backend environment variables.',
      };
    }

    const results = {
      configured: true,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      api_version: apiVersion,
      phone_verification: null,
      waba_details: null,
      templates: [],
      errors: [],
    };

    // 1. Phone number inspection
    try {
      const phoneRes = await axios.get(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 8000,
      });
      results.phone_verification = {
        verified_name: phoneRes.data.verified_name,
        display_phone_number: phoneRes.data.display_phone_number,
        quality_rating: phoneRes.data.quality_rating,
        code_verification_status: phoneRes.data.code_verification_status,
        platform_type: phoneRes.data.platform_type,
      };
    } catch (e) {
      results.errors.push(`Phone inspection failed: ${e.response?.data?.error?.message || e.message}`);
    }

    // 2. WABA inspection
    try {
      const wabaRes = await axios.get(`https://graph.facebook.com/${apiVersion}/${wabaId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 8000,
      });
      results.waba_details = {
        name: wabaRes.data.name,
        currency: wabaRes.data.currency,
        timezone_id: wabaRes.data.timezone_id,
      };
    } catch (e) {
      results.errors.push(`WABA inspection failed: ${e.response?.data?.error?.message || e.message}`);
    }

    // 3. Template inspection
    try {
      const tplRes = await axios.get(`https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 8000,
      });
      results.templates = (tplRes.data?.data || []).map((t) => ({
        name: t.name,
        status: t.status,
        language: t.language,
        category: t.category,
      }));
    } catch (e) {
      results.errors.push(`Template inspection failed: ${e.response?.data?.error?.message || e.message}`);
    }

    return results;
  },

  /**
   * Handle incoming WhatsApp Webhooks for message status updates (sent, delivered, read, failed)
   */
  async handleWebhookPayload(payload, prisma) {
    if (!payload || payload.object !== 'whatsapp_business_account') {
      return { handled: false };
    }

    const entries = payload.entry || [];
    let updatedCount = 0;

    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const statuses = change.value?.statuses || [];
        for (const st of statuses) {
          const providerMsgId = st.id;
          const statusVal = st.status; // 'sent', 'delivered', 'read', 'failed'

          let dbStatus = 'SENT';
          if (statusVal === 'delivered') dbStatus = 'DELIVERED';
          else if (statusVal === 'read') dbStatus = 'DELIVERED';
          else if (statusVal === 'failed') dbStatus = 'FAILED';

          try {
            const matchedJob = await prisma.notification_jobs.findFirst({
              where: { provider_message_id: providerMsgId },
            });

            if (matchedJob) {
              await prisma.notification_jobs.update({
                where: { id: matchedJob.id },
                data: {
                  status: dbStatus,
                  opened_at: statusVal === 'read' ? new Date() : matchedJob.opened_at,
                  error_message: statusVal === 'failed' ? (st.errors?.[0]?.message || 'WhatsApp delivery failed') : null,
                  channel_response: st,
                },
              });
              updatedCount++;

              // Keep consultation_reschedules in sync if linked to this consultation
              if (matchedJob.consultation_id) {
                await prisma.consultation_reschedules.updateMany({
                  where: {
                    consultation_id: matchedJob.consultation_id,
                    whatsapp_status: { in: ['QUEUED', 'SENT'] },
                  },
                  data: {
                    whatsapp_status: dbStatus,
                  },
                }).catch(() => {});
              }

              // If part of a campaign, update campaign delivery counts
              if (matchedJob.campaign_id) {
                if (dbStatus === 'DELIVERED') {
                  await prisma.campaigns.update({
                    where: { id: matchedJob.campaign_id },
                    data: { delivered_count: { increment: 1 } },
                  }).catch(() => {});
                } else if (dbStatus === 'FAILED') {
                  await prisma.campaigns.update({
                    where: { id: matchedJob.campaign_id },
                    data: { failed_count: { increment: 1 } },
                  }).catch(() => {});
                }
              }
            }
          } catch (e) {
            console.error('[WhatsApp Webhook] Status update error:', e.message);
          }
        }
      }
    }

    return { handled: true, updatedCount };
  },
};

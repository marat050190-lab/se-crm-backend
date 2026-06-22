const axios = require('axios');

async function registerXsiSubscription() {
  const token = process.env.BEELINE_API_TOKEN;
  const webhookUrl = `${process.env.BACKEND_URL || 'https://se-crm-backend-production.up.railway.app'}/api/beeline/webhook?token=${process.env.BEELINE_WEBHOOK_SECRET || 'se-crm-webhook-2024'}`;

  try {
    const response = await axios.put(
      'https://cloudpbx.beeline.ru/api/v1/subscription',
      {
        pattern: '*',
        expires: 86400,
        subscriptionType: 'BASIC_CALL',
        url: webhookUrl
      },
      {
        headers: {
          'X-MPBX-API-AUTH-TOKEN': token,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✓ Xsi-подписка зарегистрирована:', response.data);
  } catch (err) {
    console.error('✗ Ошибка регистрации Xsi-подписки:', err.response?.data || err.message);
  }
}

module.exports = { registerXsiSubscription };

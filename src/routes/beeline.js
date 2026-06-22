const express = require('express');
const { handleWebhook } = require('../services/beeline');

const router = express.Router();

// POST /api/beeline/webhook — приём событий от Билайн
// Этот endpoint открытый (без JWT), защищён токеном в URL
router.post('/webhook', async (req, res) => {
  const token = req.query.token;

  if (token !== process.env.BEELINE_WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const result = await handleWebhook(req.body);
    res.json({ ok: true, lead: result });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

// GET /api/beeline/webhook — проверка (Билайн иногда делает GET при настройке)
router.get('/webhook', (req, res) => {
  res.json({ status: 'SE CRM Beeline webhook active' });
});

module.exports = router;

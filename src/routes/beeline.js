const express = require('express');
const router = express.Router();
const { createLeadFromCall } = require('../services/beeline');

router.post('/webhook', async (req, res) => {
  const token = req.query.token;
  if (token !== process.env.BEELINE_WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    console.log('Beeline webhook body:', JSON.stringify(req.body));
    res.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

router.get('/webhook', (req, res) => {
  res.json({ status: 'SE CRM Beeline webhook active' });
});

module.exports = router;

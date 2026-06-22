const express = require('express');
const router = express.Router();

router.post('/webhook', async (req, res) => {
  const token = req.query.token;
  if (token !== process.env.BEELINE_WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  console.log('=== BEELINE WEBHOOK ===');
  console.log('Headers:', JSON.stringify(req.headers));
  console.log('Query:', JSON.stringify(req.query));
  console.log('Body:', JSON.stringify(req.body));
  res.status(200).send('OK');
});

router.get('/webhook', (req, res) => {
  res.json({ status: 'SE CRM Beeline webhook active' });
});

module.exports = router;

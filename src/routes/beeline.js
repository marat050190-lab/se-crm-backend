const express = require('express');
const router = express.Router();
const xml2js = require('xml2js');
const { createLeadFromCall } = require('../services/beeline');

router.use(express.text({ type: 'application/xml' }));
router.use(express.text({ type: 'text/xml' }));

router.post('/webhook', async (req, res) => {
  const token = req.query.token;
  if (token !== process.env.BEELINE_WEBHOOK_SECRET) {
    return res.status(403).send('Forbidden');
  }

  try {
    const rawBody = req.body || '';
    console.log('Raw:', rawBody.substring(0, 500));

    if (!rawBody || !rawBody.includes('<')) {
      return res.status(200).send('OK');
    }

    const parsed = await xml2js.parseStringPromise(rawBody, { explicitArray: false });
    const str = JSON.stringify(parsed);
    console.log('Parsed:', str.substring(0, 1000));

    // Ищем номер звонящего
    const remoteMatch = str.match(/"tel:\+7(\d+)"/);
    const callerPhone = remoteMatch ? '7' + remoteMatch[1] : null;

    console.log('Caller:', callerPhone);

    if (callerPhone) {
      const lead = await createLeadFromCall({
        callId: Date.now().toString(),
        callerPhone,
        calledPhone: '9061209313',
        extension: null,
        duration: 0,
        status: 'answered',
        recordUrl: null,
        startedAt: new Date(),
      });
      console.log('Lead created:', lead ? lead.id : 'none');
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(200).send('OK');
  }
});

router.get('/webhook', (req, res) => {
  res.json({ status: 'SE CRM Beeline webhook active' });
});

module.exports = router;

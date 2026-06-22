const express = require('express');
const router = express.Router();
const xml2js = require('xml2js');
const { createLeadFromCall } = require('../services/beeline');
const { notifyNewCall } = require('../services/telegram');
const { getPhoneRegion } = require('../utils/phoneRegion');

router.use(express.text({ type: 'application/xml' }));
router.use(express.text({ type: 'text/xml' }));

router.post('/webhook', async (req, res) => {
  const token = req.query.token;
  if (token !== process.env.BEELINE_WEBHOOK_SECRET) {
    return res.status(403).send('Forbidden');
  }
  try {
    const rawBody = req.body || '';
    if (!rawBody || !rawBody.includes('<')) return res.status(200).send('OK');

    const parsed = await xml2js.parseStringPromise(rawBody, { explicitArray: false });
    const str = JSON.stringify(parsed);

    const remoteMatch = str.match(/"tel:\+7(\d+)"/);
    const callerPhone = remoteMatch ? '7' + remoteMatch[1] : null;

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

      const io = req.app.get('io');
      if (io) {
        io.emit('incoming_call', {
          phone: callerPhone,
          leadId: lead ? lead.id : null,
          leadNumber: lead ? lead.lead_number : null,
          timestamp: new Date().toISOString(),
        });
      }

      // Telegram уведомление
      if (lead) {
        const region = getPhoneRegion(callerPhone);
        await notifyNewCall(callerPhone, lead.id, lead.lead_number, region);
      }
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

const express = require('express');
const router = express.Router();
const xml2js = require('xml2js');
const { createLeadFromCall } = require('../services/beeline');

router.post('/webhook', async (req, res) => {
  const token = req.query.token;
  if (token !== process.env.BEELINE_WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    let rawBody = '';
    req.on('data', chunk => { rawBody += chunk.toString(); });
    req.on('end', async () => {
      console.log('Raw body:', rawBody);
      
      let callerPhone = null;
      let direction = null;
      let callId = null;

      if (rawBody && rawBody.includes('<?xml')) {
        const parsed = await xml2js.parseStringPromise(rawBody, { explicitArray: false });
        console.log('Parsed XML:', JSON.stringify(parsed));
        
        const xsiEvent = parsed['xsi:EventPackage'] || parsed['EventPackage'] || parsed;
        const event = xsiEvent['xsi:Event'] || xsiEvent['Event'] || xsiEvent;
        const call = event && (event['xsi:call'] || event['call'] || event);
        
        if (call) {
          callerPhone = call['xsi:remoteParty'] || call['remoteParty'] || call['xsi:callerAddress'] || call['callerAddress'];
          direction = call['xsi:direction'] || call['direction'] || 'INBOUND';
          callId = call['xsi:callId'] || call['callId'] || Date.now().toString();
          if (callerPhone && callerPhone.includes('@')) callerPhone = callerPhone.split('@')[0];
          if (callerPhone && callerPhone.startsWith('tel:+7')) callerPhone = '7' + callerPhone.slice(6);
          if (callerPhone && callerPhone.startsWith('tel:')) callerPhone = callerPhone.slice(4);
        }
      }

      if (callerPhone && direction === 'INBOUND') {
        const lead = await createLeadFromCall({
          callId: callId || Date.now().toString(),
          callerPhone,
          calledPhone: null,
          extension: null,
          duration: 0,
          status: 'answered',
          recordUrl: null,
          startedAt: new Date(),
        });
        console.log('Lead created:', lead);
      }

      res.status(200).send('OK');
    });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).send('Error');
  }
});

router.get('/webhook', (req, res) => {
  res.json({ status: 'SE CRM Beeline webhook active' });
});

module.exports = router;

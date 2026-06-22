const express = require('express');
const router = express.Router();
const { createLeadFromCall } = require('../services/beeline');

router.post('/webhook', async (req, res) => {
  const token = req.query.token;
  if (token !== process.env.BEELINE_WEBHOOK_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    // Логируем всё что приходит для отладки
    console.log('Beeline webhook body:', JSON.stringify(req.body));
    console.log('Beeline webhook headers:', JSON.stringify(req.headers));

    const body = req.body;

    // Xsi-Events формат
    let callerPhone = null;
    let calledPhone = null;
    let callId = null;
    let eventType = null;
    let direction = null;

    // Билайн может слать как JSON так и XML-parsed объект
    if (body.xsiEvent || body['xsi:Event']) {
      const event = body.xsiEvent || body['xsi:Event'];
      eventType = event.eventType || event['xsi:eventType'];
      const call = event.call || event['xsi:call'] || {};


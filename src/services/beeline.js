const axios = require('axios');
const pool = require('../db/pool');

const BEELINE_API = 'https://cloudpbx.beeline.ru/api/v1';
const BEELINE_TOKEN = process.env.BEELINE_API_TOKEN;

const headers = {
  'X-MPBX-API-AUTH-TOKEN': BEELINE_TOKEN,
  'Content-Type': 'application/json',
};

// Генерация номера лида
async function generateLeadNumber() {
  const res = await pool.query(
    "SELECT lead_number FROM leads ORDER BY id DESC LIMIT 1"
  );
  if (!res.rows.length) return 'SE-0001';
  const last = res.rows[0].lead_number; // SE-0042
  const num = parseInt(last.replace('SE-', '')) + 1;
  return `SE-${String(num).padStart(4, '0')}`;
}

// Создать лид из звонка
async function createLeadFromCall(call) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Проверяем — нет ли уже лида с этим call_id
    const existing = await client.query(
      'SELECT id FROM beeline_calls WHERE call_id = $1', [call.callId]
    );
    if (existing.rows.length) {
      await client.query('ROLLBACK');
      return null;
    }

    // Ищем менеджера по добавочному
    let assignedTo = null;
    if (call.extension) {
      const userRes = await client.query(
        'SELECT id FROM users WHERE beeline_extension = $1 AND is_active = true',
        [call.extension]
      );
      if (userRes.rows.length) assignedTo = userRes.rows[0].id;
    }

    // Создаём лид
    const leadNumber = await generateLeadNumber();
    const leadRes = await client.query(`
      INSERT INTO leads (
        lead_number, client_phone, source,
        beeline_call_id, beeline_record_url,
        status, assigned_to
      ) VALUES ($1, $2, 'call', $3, $4, 'new', $5)
      RETURNING id
    `, [
      leadNumber,
      call.callerPhone,
      call.callId,
      call.recordUrl || null,
      assignedTo,
    ]);
    const leadId = leadRes.rows[0].id;

    // Сохраняем звонок
    await client.query(`
      INSERT INTO beeline_calls (
        call_id, caller_phone, called_phone, extension,
        direction, duration_sec, status, record_url,
        started_at, lead_id, processed, raw_data
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11)
    `, [
      call.callId,
      call.callerPhone,
      call.calledPhone,
      call.extension,
      'inbound',
      call.duration || 0,
      call.status || 'answered',
      call.recordUrl || null,
      call.startedAt || new Date(),
      leadId,
      JSON.stringify(call),
    ]);

    // История
    await client.query(`
      INSERT INTO lead_history (lead_id, action, new_value, comment)
      VALUES ($1, 'created', 'new', $2)
    `, [leadId, `Создан автоматически из звонка Билайн. Телефон: ${call.callerPhone}`]);

    await client.query('COMMIT');
    console.log(`✓ Создан лид ${leadNumber} из звонка ${call.callerPhone}`);
    return { leadId, leadNumber };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка создания лида из звонка:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Получить историю звонков из Билайн API (polling)
async function fetchRecentCalls() {
  if (!BEELINE_TOKEN) return;
  try {
    const now = new Date();
    const from = new Date(now - 5 * 60 * 1000); // последние 5 минут

    const res = await axios.get(`${BEELINE_API}/calls/history`, {
      headers,
      params: {
        dateFrom: from.toISOString(),
        dateTo: now.toISOString(),
        type: 'INBOUND',
      },
    });

    const calls = res.data?.calls || [];
    let created = 0;

    for (const call of calls) {
      if (call.status === 'ANSWERED' || call.status === 'MISSED') {
        const result = await createLeadFromCall({
          callId: call.id,
          callerPhone: call.from,
          calledPhone: call.to,
          extension: call.extension,
          duration: call.duration,
          status: call.status.toLowerCase(),
          recordUrl: call.recordId ? `${BEELINE_API}/records/${call.recordId}` : null,
          startedAt: new Date(call.startDate),
        });
        if (result) created++;
      }
    }

    if (created > 0) {
      console.log(`Билайн polling: создано ${created} новых лидов`);
    }
  } catch (err) {
    // Не крашим сервер если Билайн недоступен
    if (err.response?.status === 401) {
      console.error('Билайн API: неверный токен');
    } else {
      console.error('Билайн polling ошибка:', err.message);
    }
  }
}

// Обработка вебхука (если настроен в Билайн)
async function handleWebhook(payload) {
  const { event, call } = payload;

  if (event === 'call.completed' && call.direction === 'INBOUND') {
    return await createLeadFromCall({
      callId: call.id,
      callerPhone: call.from,
      calledPhone: call.to,
      extension: call.extension,
      duration: call.duration,
      status: call.answered ? 'answered' : 'missed',
      recordUrl: call.recordUrl || null,
      startedAt: new Date(call.startDate),
    });
  }
  return null;
}

module.exports = { fetchRecentCalls, handleWebhook, createLeadFromCall };

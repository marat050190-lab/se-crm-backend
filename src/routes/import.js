const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

const SECRET = 'se-migrate-2024';

router.post('/clients', async (req, res) => {
  if (req.query.secret !== SECRET) return res.status(403).json({ error: 'Forbidden' });
  const { clients } = req.body;
  if (!clients?.length) return res.status(400).json({ error: 'No clients' });
  let inserted = 0, skipped = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const c of clients) {
      const exists = c.inn
        ? await client.query('SELECT id FROM clients WHERE inn = $1', [c.inn])
        : await client.query('SELECT id FROM clients WHERE name = $1', [c.name]);
      if (exists.rows.length > 0) { skipped++; continue; }
      await client.query(
        `INSERT INTO clients (name, client_type, company_name, inn, phone, created_at) VALUES ($1, 'legal', $2, $3, $4, $5)`,
        [c.name, c.company_name || c.name, c.inn || null, c.phone || null, c.created_at || new Date()]
      );
      inserted++;
    }
    await client.query('COMMIT');
    res.json({ ok: true, inserted, skipped });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

router.post('/orders', async (req, res) => {
  if (req.query.secret !== SECRET) return res.status(403).json({ error: 'Forbidden' });
  const { orders } = req.body;
  if (!orders?.length) return res.status(400).json({ error: 'No orders' });
  const STATUS_MAP = { 'Счёт выставлен': 'paid', 'Отменено': 'cancelled', 'Завершено': 'done', 'Выставить счёт': 'invoice', 'Новая заявка': 'new' };
  const adminRes = await pool.query("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1");
  const managerId = adminRes.rows[0]?.id || 1;
  let inserted = 0, skipped = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const o of orders) {
      let clientId = null;
      if (o.inn) {
        const cr = await client.query('SELECT id FROM clients WHERE inn = $1', [o.inn]);
        if (cr.rows.length > 0) clientId = cr.rows[0].id;
        else {
          const nc = await client.query(`INSERT INTO clients (name, client_type, company_name, inn, phone) VALUES ($1, 'legal', $1, $2, $3) RETURNING id`, [o.inn, o.inn, o.phone || null]);
          clientId = nc.rows[0].id;
        }
      }
      if (!clientId) { skipped++; continue; }
      const status = STATUS_MAP[o.status] || 'done';
      const profit = parseFloat(o.net_profit) || 0;
      await client.query(`INSERT INTO orders (client_id, manager_id, legal_entity, service_type, net_profit, revenue, executor_cost, status, created_at, updated_at, calc_scheme, units, client_rate, executor_rate) VALUES ($1, $2, 'ip', 'Иное', $3, $4, 0, $5, $6, $6, 'ip_nal', 1, $4, 0)`,
        [clientId, managerId, profit, Math.max(profit, 0), status, o.created_at || new Date()]);
      inserted++;
    }
    await client.query('COMMIT');
    res.json({ ok: true, inserted, skipped });
  } catch(e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');

// Список клиентов (свои — у менеджера, все — у админов/РОП)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { role, id } = req.user;
    const seeAll = ['super_admin', 'admin', 'cs_head'].includes(role);
    const isDispatcher = role === 'dispatcher';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let where, params;
    if (isDispatcher) {
      where = `WHERE c.id IN (SELECT client_id FROM orders WHERE dispatcher_id=$1)`;
      params = [id];
    } else if (seeAll) {
      where = search ? `WHERE (c.name ILIKE $1 OR c.phone ILIKE $1 OR c.company_name ILIKE $1)` : '';
      params = search ? [`%${search}%`] : [];
    } else if (role === 'b2b_manager') {
      where = `WHERE c.manager_id=$1 AND c.lead_id IS NOT NULL${search ? ` AND (c.name ILIKE $2 OR c.phone ILIKE $2)` : ''}`;
      params = search ? [id, `%${search}%`] : [id];
    } else if (role === 'rop') {
      where = `WHERE c.lead_id IS NOT NULL AND (c.manager_id=$1 OR c.manager_id IN (SELECT id FROM users WHERE rop_id=$1 AND role IN ('dispatcher','b2b_manager','mfl_manager')) OR (c.manager_id IN (SELECT id FROM users WHERE rop_id=$1 AND role = 'cs_manager') AND c.created_at > NOW() - INTERVAL '90 days' AND c.id IN (SELECT DISTINCT client_id FROM orders WHERE dispatcher_id IS NOT NULL)))${search ? ` AND (c.name ILIKE $2 OR c.phone ILIKE $2)` : ''}`;
      params = search ? [id, `%${search}%`] : [id];
    } else {
      where = `WHERE c.manager_id=$1${search ? ` AND (c.name ILIKE $2 OR c.phone ILIKE $2)` : ''}`;
      params = search ? [id, `%${search}%`] : [id];
    }

    const countRes = await pool.query(`SELECT COUNT(*) FROM clients c ${where}`, params);
    const total = parseInt(countRes.rows[0].count);
    const pages = Math.ceil(total / limit);

    const dataParams = [...params, limit, offset];
    const { rows } = await pool.query(
      `SELECT c.*, u.name AS manager_name FROM clients c LEFT JOIN users u ON u.id=c.manager_id ${where} ORDER BY c.created_at DESC LIMIT $${dataParams.length-1} OFFSET $${dataParams.length}`,
      dataParams
    );
    res.json({ clients: rows, total, pages, page });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Автодополнение клиентов по имени (для фильтров)
router.get('/suggest', authMiddleware, async (req, res) => {
  try {
    const { role, id } = req.user;
    const q = req.query.q || '';
    if (q.length < 2) return res.json([]);

    const seeAll = ['super_admin', 'admin', 'cs_head', 'rop'].includes(role);
    let where, params;
    if (seeAll) {
      where = `WHERE c.name ILIKE $1`;
      params = [`%${q}%`];
    } else {
      where = `WHERE c.manager_id=$1 AND c.name ILIKE $2`;
      params = [id, `%${q}%`];
    }

    const { rows } = await pool.query(
      `SELECT DISTINCT c.name, c.inn FROM clients c ${where} ORDER BY c.name LIMIT 10`,
      params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Один клиент + его заказы
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const c = await pool.query(`SELECT c.*, u.name AS manager_name, l.status AS lead_status FROM clients c LEFT JOIN users u ON u.id=c.manager_id LEFT JOIN leads l ON l.id=c.lead_id WHERE c.id=$1`, [req.params.id]);
    if (!c.rows.length) return res.status(404).json({ error: 'Not found' });
    const o = await pool.query('SELECT * FROM orders WHERE client_id=$1 ORDER BY created_at DESC', [req.params.id]);
    res.json({ client: c.rows[0], orders: o.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Создать клиента
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, phone, client_type, company_name, inn, lead_id, comment } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO clients (name, phone, client_type, company_name, inn, manager_id, lead_id, comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, phone, client_type || 'individual', company_name, inn, req.user.id, lead_id || null, comment]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Обновить клиента
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, phone, client_type, company_name, inn, comment, manager_id } = req.body;
    const { rows } = await pool.query(
      `UPDATE clients SET name=$1, phone=$2, client_type=$3, company_name=$4, inn=$5, comment=$6, manager_id=COALESCE($8, manager_id)
       WHERE id=$7 RETURNING *`,
      [name, phone, client_type, company_name, inn, comment, req.params.id, manager_id || null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

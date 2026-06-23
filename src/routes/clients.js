const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');

// Список клиентов (свои — у менеджера, все — у админов/РОП)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { role, id } = req.user;
    const seeAll = ['super_admin', 'admin', 'cs_head'].includes(role);
    let sql, params;
    if (seeAll) {
      sql = `SELECT c.*, u.name AS manager_name FROM clients c LEFT JOIN users u ON u.id=c.manager_id ORDER BY c.created_at DESC`;
      params = [];
    } else if (role === 'rop') {
      sql = `SELECT c.*, u.name AS manager_name FROM clients c LEFT JOIN users u ON u.id=c.manager_id
             WHERE c.manager_id=$1 OR c.manager_id IN (SELECT id FROM users WHERE rop_id=$1)
             ORDER BY c.created_at DESC`;
      params = [id];
    } else {
      sql = `SELECT c.*, u.name AS manager_name FROM clients c LEFT JOIN users u ON u.id=c.manager_id WHERE c.manager_id=$1 ORDER BY c.created_at DESC`;
      params = [id];
    }
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Один клиент + его заказы
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const c = await pool.query('SELECT * FROM clients WHERE id=$1', [req.params.id]);
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
    const { name, phone, client_type, company_name, inn, comment } = req.body;
    const { rows } = await pool.query(
      `UPDATE clients SET name=$1, phone=$2, client_type=$3, company_name=$4, inn=$5, comment=$6
       WHERE id=$7 RETURNING *`,
      [name, phone, client_type, company_name, inn, comment, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

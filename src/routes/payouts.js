const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// Получить все выплаты
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, 
        c.full_name as contractor_name,
        c.contractor_type,
        o.id as order_num,
        u.name as created_by_name
      FROM payouts p
      LEFT JOIN contractors c ON c.id = p.contractor_id
      LEFT JOIN orders o ON o.id = p.order_id
      LEFT JOIN users u ON u.id = p.created_by
      ORDER BY p.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Создать выплату
router.post('/', async (req, res) => {
  const { contractor_id, order_id, amount, legal_entity, comment } = req.body;
  const created_by = req.user?.id;
  try {
    const contractor = await pool.query('SELECT * FROM contractors WHERE id = $1', [contractor_id]);
    if (!contractor.rows.length) return res.status(404).json({ error: 'Исполнитель не найден' });
    const c = contractor.rows[0];
    const result = await pool.query(`
      INSERT INTO payouts (contractor_id, order_id, amount, legal_entity, contractor_type, bank_name, payment_phone, payment_card, comment, created_by, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
      RETURNING *
    `, [contractor_id, order_id || null, amount, legal_entity, c.contractor_type, c.bank_name, c.payment_phone, c.payment_card, comment, created_by]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Обновить статус выплаты
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  try {
    const result = await pool.query(
      `UPDATE payouts SET status=$1, executed_at=CASE WHEN $1='done' THEN NOW() ELSE executed_at END WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

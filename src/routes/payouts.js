const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const tbank = require('../services/tbank');

// Получить все выплаты
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, 
        c.name as contractor_name,
        c.contractor_type,
        c.inn,
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
    `, [contractor_id, order_id||null, amount, legal_entity, c.contractor_type||c.type, c.bank_name, c.payment_phone||c.sbp_phone, c.payment_card||c.card_number, comment, created_by]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Выполнить выплату через Т-Банк (самозанятый)
router.post('/:id/execute', async (req, res) => {
  try {
    const payout = await pool.query('SELECT p.*, c.inn, c.name as contractor_name, c.phone FROM payouts p LEFT JOIN contractors c ON c.id = p.contractor_id WHERE p.id = $1', [req.params.id]);
    if (!payout.rows.length) return res.status(404).json({ error: 'Выплата не найдена' });
    const p = payout.rows[0];

    if (p.contractor_type === 'self_employed') {
      // Добавляем самозанятого в Т-Банк если нет recipientId
      let recipientId = p.tbank_payout_id;
      if (!recipientId) {
        const selfEmployed = await tbank.addSelfEmployed(p.inn, p.phone);
        recipientId = selfEmployed.recipientId || selfEmployed.id;
        await pool.query('UPDATE payouts SET tbank_payout_id=$1 WHERE id=$2', [recipientId, p.id]);
      }

      // Создаём реестр и оплачиваем
      const registry = await tbank.createAndPayRegistry([{
        recipientId,
        amount: parseFloat(p.amount),
        description: p.comment || `Оплата услуг по заявке`
      }]);

      await pool.query(
        'UPDATE payouts SET status=$1, tbank_payout_id=$2, executed_at=NOW() WHERE id=$3',
        ['processing', registry.registryId || recipientId, p.id]
      );

      res.json({ ok: true, registry });
    } else {
      res.status(400).json({ error: 'Для физлиц используйте Best2Pay' });
    }
  } catch (err) {
    await pool.query('UPDATE payouts SET status=$1 WHERE id=$2', ['error', req.params.id]);
    res.status(500).json({ error: err.message });
  }
});

// Обновить статус выплаты вручную
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

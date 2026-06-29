const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');

// Расчёт прибыли по 4 схемам из калькулятора
// revenue — выручка (клиент платит), executorCost — расход на исполнителя
function calcProfit(scheme, revenue, executorCost) {
  const n = Number(revenue) || 0;
  const k = Number(executorCost) || 0;
  let net = 0;
  switch (scheme) {
    case 'nds_ip': {
      // НДС → ИП/СМЗ/НАЛ: прибыль = n - n/120*20 - k, затем налог на прибыль 25% и вывод нала 3%
      const grossProfit = n - n / 120 * 20 - k;
      const profitTax = grossProfit * 0.25;
      const cashOut = (grossProfit - profitTax) * 0.03;
      net = grossProfit - profitTax - cashOut;
      break;
    }
    case 'nds_nds': {
      // НДС → НДС: прибыль = n - (n-k)/120*20 - k, налог на прибыль 25%
      const grossProfit = n - (n - k) / 120 * 20 - k;
      net = grossProfit - grossProfit * 0.25;
      break;
    }
    case 'ip_nal': {
      // ИП → НАЛ: УСН 16% от выручки, прибыль = n - k - налог
      const tax = n * 0.16;
      net = n - k - tax;
      break;
    }
    case 'ip_ip': {
      // ИП → ИП: УСН 13% от выручки, прибыль = n - k - налог
      const tax = n * 0.13;
      net = n - k - tax;
      break;
    }
    default:
      net = n - k;
  }
  return Math.round(net * 100) / 100;
}

// Список заявок
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { role, id } = req.user;
    const { status } = req.query;
    const seeAll = ['super_admin', 'admin', 'cs_head'].includes(role);
    let where = [];
    let params = [];
    let i = 1;
    if (role === 'rop') {
      // РОП видит заявки своих менеджеров (rop_id = его id) + свои
      where.push(`(o.manager_id=$${i} OR o.manager_id IN (SELECT id FROM users WHERE rop_id=$${i}))`);
      params.push(id); i++;
    } else if (!seeAll) {
      where.push(`o.manager_id=$${i++}`); params.push(id);
    }
    if (status) { where.push(`o.status=$${i++}`); params.push(status); }
    const wsql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await pool.query(
      `SELECT o.*, c.name AS client_name, c.phone AS client_phone, u.name AS manager_name
       FROM orders o
       LEFT JOIN clients c ON c.id=o.client_id
       LEFT JOIN users u ON u.id=o.manager_id
       ${wsql} ORDER BY o.created_at DESC`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Предпросчёт прибыли (для формы, без сохранения)
router.post('/calc', authMiddleware, async (req, res) => {
  const { calc_scheme, client_rate, executor_rate, units } = req.body;
  const u = Number(units) || 1;
  const revenue = (Number(client_rate) || 0) * u;
  const executorCost = (Number(executor_rate) || 0) * u;
  const net = calcProfit(calc_scheme, revenue, executorCost);
  res.json({ revenue, executor_cost: executorCost, net_profit: net });
});

// Создать заявку
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { client_id, legal_entity, service_type, work_date, address,
            client_rate, executor_rate, units, calc_scheme, payment_method, comment } = req.body;
    const u = Number(units) || 1;
    const revenue = (Number(client_rate) || 0) * u;
    const executorCost = (Number(executor_rate) || 0) * u;
    const net = calcProfit(calc_scheme, revenue, executorCost);
    const { rows } = await pool.query(
      `INSERT INTO orders
       (client_id, manager_id, dispatcher_id, legal_entity, service_type, work_date, address,
        client_rate, executor_rate, units, calc_scheme, revenue, executor_cost, net_profit, payment_method, comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [client_id, req.user.id, req.user.role === 'dispatcher' ? req.user.id : null,
       legal_entity, service_type, work_date || null, address,
       client_rate, executor_rate, u, calc_scheme, revenue, executorCost, net, payment_method, comment]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Сменить статус
router.put('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const { rows } = await pool.query(
      `UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [status, req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Отметить оплату счёта / оплату исполнителю
router.put('/:id/payment', authMiddleware, async (req, res) => {
  try {
    const { invoice_paid, executor_paid, payment_method } = req.body;
    const { rows } = await pool.query(
      `UPDATE orders SET
         invoice_paid=COALESCE($1, invoice_paid),
         executor_paid=COALESCE($2, executor_paid),
         payment_method=COALESCE($3, payment_method),
         updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [invoice_paid, executor_paid, payment_method, req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Обновить заявку (с пересчётом)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { legal_entity, service_type, work_date, address,
            client_rate, executor_rate, units, calc_scheme, comment } = req.body;
    const u = Number(units) || 1;
    const revenue = (Number(client_rate) || 0) * u;
    const executorCost = (Number(executor_rate) || 0) * u;
    const net = calcProfit(calc_scheme, revenue, executorCost);
    const { rows } = await pool.query(
      `UPDATE orders SET legal_entity=$1, service_type=$2, work_date=$3, address=$4,
        client_rate=$5, executor_rate=$6, units=$7, calc_scheme=$8,
        revenue=$9, executor_cost=$10, net_profit=$11, comment=$12, updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [legal_entity, service_type, work_date || null, address,
       client_rate, executor_rate, u, calc_scheme, revenue, executorCost, net, comment, req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

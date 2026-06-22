const express = require('express');
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/leads — список с фильтрами
router.get('/', async (req, res) => {
  const {
    status, assigned_to, search,
    page = 1, limit = 30,
    date_from, date_to
  } = req.query;

  const conditions = [];
  const params = [];
  let i = 1;

  // Менеджер видит только свои лиды, РОП и админ — все
  if (req.user.role === 'manager') {
    conditions.push(`l.assigned_to = $${i++}`);
    params.push(req.user.id);
  } else if (assigned_to) {
    conditions.push(`l.assigned_to = $${i++}`);
    params.push(assigned_to);
  }

  if (status && status !== 'all') {
    conditions.push(`l.status = $${i++}`);
    params.push(status);
  }

  if (search) {
    conditions.push(`(l.client_name ILIKE $${i} OR l.client_phone ILIKE $${i} OR l.lead_number ILIKE $${i} OR l.client_company ILIKE $${i})`);
    params.push(`%${search}%`);
    i++;
  }

  if (date_from) {
    conditions.push(`l.created_at >= $${i++}`);
    params.push(date_from);
  }

  if (date_to) {
    conditions.push(`l.created_at <= $${i++}`);
    params.push(date_to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM leads l ${where}`,
      params
    );
    const total = parseInt(countRes.rows[0].count);

    const leadsRes = await pool.query(`
      SELECT
        l.*,
        u.name AS assigned_name,
        (SELECT COUNT(*) FROM tasks t WHERE t.lead_id = l.id AND t.status = 'pending') AS pending_tasks
      FROM leads l
      LEFT JOIN users u ON u.id = l.assigned_to
      ${where}
      ORDER BY l.created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `, [...params, parseInt(limit), offset]);

    res.json({
      leads: leadsRes.rows,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки лидов' });
  }
});

// GET /api/leads/:id — карточка лида
router.get('/:id', async (req, res) => {
  try {
    const leadRes = await pool.query(`
      SELECT l.*, u.name AS assigned_name, u.phone AS assigned_phone
      FROM leads l
      LEFT JOIN users u ON u.id = l.assigned_to
      WHERE l.id = $1
    `, [req.params.id]);

    if (!leadRes.rows.length) return res.status(404).json({ error: 'Лид не найден' });

    const lead = leadRes.rows[0];

    // Ограничение доступа для менеджера
    if (req.user.role === 'manager' && lead.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    // Задачи
    const tasksRes = await pool.query(`
      SELECT t.*, u.name AS assigned_name
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to
      WHERE t.lead_id = $1
      ORDER BY t.due_date ASC NULLS LAST, t.created_at ASC
    `, [req.params.id]);

    // История
    const historyRes = await pool.query(`
      SELECT h.*, u.name AS user_name
      FROM lead_history h
      LEFT JOIN users u ON u.id = h.user_id
      WHERE h.lead_id = $1
      ORDER BY h.created_at ASC
    `, [req.params.id]);

    res.json({ lead, tasks: tasksRes.rows, history: historyRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки лида' });
  }
});

// POST /api/leads — создать вручную
router.post('/', async (req, res) => {
  const {
    client_name, client_phone, client_company,
    service_type, source = 'call',
    comment, assigned_to,
  } = req.body;

  if (!client_phone) {
    return res.status(400).json({ error: 'Телефон обязателен' });
  }

  try {
    // Генерируем номер
    const numRes = await pool.query("SELECT lead_number FROM leads ORDER BY id DESC LIMIT 1");
    let leadNumber = 'SE-0001';
    if (numRes.rows.length) {
      const last = numRes.rows[0].lead_number;
      const num = parseInt(last.replace('SE-', '')) + 1;
      leadNumber = `SE-${String(num).padStart(4, '0')}`;
    }

    const result = await pool.query(`
      INSERT INTO leads (
        lead_number, client_name, client_phone, client_company,
        service_type, source, comment,
        assigned_to, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'new')
      RETURNING *
    `, [
      leadNumber, client_name, client_phone, client_company,
      service_type, source, comment,
      assigned_to || req.user.id,
    ]);

    await pool.query(`
      INSERT INTO lead_history (lead_id, user_id, action, comment)
      VALUES ($1, $2, 'created', 'Лид создан вручную')
    `, [result.rows[0].id, req.user.id]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания лида' });
  }
});

// PATCH /api/leads/:id — обновить поля
router.patch('/:id', async (req, res) => {
  const ALLOWED_FIELDS = [
    'client_name', 'client_phone', 'client_company',
    'service_type', 'move_date', 'move_time_from',
    'address_from', 'address_from_floor', 'address_from_elevator', 'address_from_lift',
    'address_to', 'address_to_floor', 'address_to_elevator', 'address_to_lift',
    'volume_m3', 'workers_count', 'hours_estimate',
    'has_packing', 'has_disassembly', 'has_rigging',
    'price_estimate', 'comment', 'assigned_to',
  ];

  const updates = {};
  for (const field of ALLOWED_FIELDS) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'Нет полей для обновления' });
  }

  try {
    const sets = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [req.params.id, ...Object.values(updates)];

    const result = await pool.query(
      `UPDATE leads SET ${sets} WHERE id = $1 RETURNING *`,
      values
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Лид не найден' });

    // Лог изменений
    await pool.query(`
      INSERT INTO lead_history (lead_id, user_id, action, comment)
      VALUES ($1, $2, 'field_update', $3)
    `, [req.params.id, req.user.id, `Обновлены поля: ${Object.keys(updates).join(', ')}`]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

// PATCH /api/leads/:id/status — изменить статус
router.patch('/:id/status', async (req, res) => {
  const { status, lost_reason, postponed_until, comment } = req.body;

  const VALID_STATUSES = ['new', 'in_progress', 'kp_sent', 'negotiation', 'won', 'lost', 'postponed'];
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Неверный статус' });
  }

  try {
    const current = await pool.query('SELECT status FROM leads WHERE id = $1', [req.params.id]);
    if (!current.rows.length) return res.status(404).json({ error: 'Лид не найден' });

    const oldStatus = current.rows[0].status;

    await pool.query(
      'UPDATE leads SET status = $1, lost_reason = $2, postponed_until = $3 WHERE id = $4',
      [status, lost_reason || null, postponed_until || null, req.params.id]
    );

    await pool.query(`
      INSERT INTO lead_history (lead_id, user_id, action, old_value, new_value, comment)
      VALUES ($1, $2, 'status_change', $3, $4, $5)
    `, [req.params.id, req.user.id, oldStatus, status, comment || null]);

    res.json({ success: true, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка изменения статуса' });
  }
});

// POST /api/leads/:id/comment — добавить комментарий
router.post('/:id/comment', async (req, res) => {
  const { comment } = req.body;
  if (!comment?.trim()) return res.status(400).json({ error: 'Комментарий пуст' });

  try {
    await pool.query(`
      INSERT INTO lead_history (lead_id, user_id, action, comment)
      VALUES ($1, $2, 'comment', $3)
    `, [req.params.id, req.user.id, comment.trim()]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

module.exports = router;

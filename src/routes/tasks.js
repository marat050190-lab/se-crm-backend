const express = require('express');
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// POST /api/tasks — создать задачу
router.post('/', async (req, res) => {
  const { lead_id, assigned_to, type, title, description, due_date } = req.body;

  if (!lead_id || !title) {
    return res.status(400).json({ error: 'lead_id и title обязательны' });
  }

  try {
    const result = await pool.query(`
      INSERT INTO tasks (lead_id, assigned_to, created_by, type, title, description, due_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [lead_id, assigned_to || req.user.id, req.user.id, type || 'other', title, description, due_date || null]);

    await pool.query(`
      INSERT INTO lead_history (lead_id, user_id, action, comment)
      VALUES ($1, $2, 'task_created', $3)
    `, [lead_id, req.user.id, `Задача: ${title}`]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка создания задачи' });
  }
});

// PATCH /api/tasks/:id/done — закрыть задачу
router.patch('/:id/done', async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE tasks SET status = 'done', completed_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [req.params.id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Задача не найдена' });

    await pool.query(`
      INSERT INTO lead_history (lead_id, user_id, action, comment)
      VALUES ($1, $2, 'task_done', $3)
    `, [result.rows[0].lead_id, req.user.id, `Задача выполнена: ${result.rows[0].title}`]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

// GET /api/tasks/my — мои задачи
router.get('/my', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, l.lead_number, l.client_name, l.client_phone
      FROM tasks t
      LEFT JOIN leads l ON l.id = t.lead_id
      WHERE t.assigned_to = $1 AND t.status = 'pending'
      ORDER BY t.due_date ASC NULLS LAST, t.created_at ASC
    `, [req.user.id]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка' });
  }
});

module.exports = router;

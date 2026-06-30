const express = require('express');
const pool = require('../db/pool');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/stats/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.role === 'manager' ? req.user.id : null;
    const userFilter = userId ? `AND assigned_to = ${userId}` : '';

    const [byStatus, todayTasks, conversion] = await Promise.all([
      // Лиды по статусам
      pool.query(`
        SELECT status, COUNT(*) as count
        FROM leads
        WHERE created_at >= NOW() - INTERVAL '30 days' ${userFilter}
        GROUP BY status
      `),
      // Задачи на сегодня
      pool.query(`
        SELECT COUNT(*) as count FROM tasks
        WHERE assigned_to = $1
          AND status = 'pending'
          AND due_date::date = CURRENT_DATE
      `, [req.user.id]),
      // Конверсия за 30 дней
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'won') as won,
          COUNT(*) FILTER (WHERE status = 'lost') as lost,
          COUNT(*) as total
        FROM leads
        WHERE created_at >= NOW() - INTERVAL '30 days' ${userFilter}
      `),
    ]);

    const statusMap = {};
    byStatus.rows.forEach(r => { statusMap[r.status] = parseInt(r.count); });

    res.json({
      byStatus: statusMap,
      todayTasks: parseInt(todayTasks.rows[0].count),
      conversion: conversion.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка статистики' });
  }
});


// KPI диспетчера
router.get('/dispatcher', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const today = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) as today_total,
        COUNT(*) FILTER (WHERE status = 'in_progress' AND assigned_to = $1) as in_progress,
        COUNT(*) FILTER (WHERE status IN ('transferred_mfl','transferred_b2b','taken') AND assigned_to = $1 AND DATE(updated_at) = CURRENT_DATE) as today_converted,
        COUNT(*) FILTER (WHERE status IN ('expensive','no_answer','found_another','not_our_service','rejected','spam') AND assigned_to = $1 AND DATE(updated_at) = CURRENT_DATE) as today_rejected
      FROM leads
      WHERE assigned_to = $1
    `, [userId]);

    const rejectReasons = await pool.query(`
      SELECT lost_reason, COUNT(*) as count
      FROM leads
      WHERE assigned_to = $1 AND lost_reason IS NOT NULL
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY lost_reason ORDER BY count DESC
    `, [userId]);

    const conversion = await pool.query(`
      SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('transferred_mfl','transferred_b2b','taken')) as converted
      FROM leads
      WHERE assigned_to = $1 AND created_at >= NOW() - INTERVAL '30 days'
    `, [userId]);

    const avgResponse = await pool.query(`
      SELECT AVG(EXTRACT(EPOCH FROM (lh.created_at - l.created_at))/60) as avg_minutes
      FROM lead_history lh
      JOIN leads l ON l.id = lh.lead_id
      WHERE lh.action = 'status_changed' AND lh.new_value = 'in_progress'
        AND lh.user_id = $1 AND lh.created_at >= NOW() - INTERVAL '30 days'
    `, [userId]);

    const byStatus = await pool.query(`
      SELECT status, COUNT(*) as count FROM leads
      WHERE assigned_to = $1 AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY status ORDER BY count DESC
    `, [userId]);

    res.json({
      today: today.rows[0],
      rejectReasons: rejectReasons.rows,
      conversion: conversion.rows[0],
      avgResponseMinutes: Math.round(avgResponse.rows[0]?.avg_minutes || 0),
      byStatus: byStatus.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка статистики диспетчера' });
  }
});

// GET /api/stats/sales-departments — статистика ОП в разрезе подразделений и сотрудников
router.get('/sales-departments', async (req, res) => {
  try {
    const dateFrom = req.query.date_from || new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
    const dateTo = req.query.date_to || new Date().toISOString().slice(0,10);

    const byEmployee = await pool.query(`
      SELECT u.id, u.name, u.role,
        COUNT(l.id) FILTER (WHERE l.created_at >= $1 AND l.created_at < ($2::date + INTERVAL '1 day')) as leads_total,
        COUNT(l.id) FILTER (WHERE l.status = 'new' AND l.created_at >= $1 AND l.created_at < ($2::date + INTERVAL '1 day')) as leads_new,
        COUNT(l.id) FILTER (WHERE l.status = 'in_progress' AND l.created_at >= $1 AND l.created_at < ($2::date + INTERVAL '1 day')) as leads_in_progress,
        COUNT(l.id) FILTER (WHERE l.status IN ('transferred_mfl','transferred_b2b','taken','b2b_approved') AND l.created_at >= $1 AND l.created_at < ($2::date + INTERVAL '1 day')) as leads_won
      FROM users u
      LEFT JOIN leads l ON l.assigned_to = u.id
      WHERE u.role IN ('dispatcher','b2b_manager','mfl_manager') AND u.is_active = true
      GROUP BY u.id, u.name, u.role
      ORDER BY u.role, u.name
    `, [dateFrom, dateTo]);

    const openTasks = await pool.query(`
      SELECT t.assigned_to as user_id, COUNT(*) as count
      FROM tasks t
      WHERE t.status = 'pending'
      GROUP BY t.assigned_to
    `);
    const tasksMap = {};
    openTasks.rows.forEach(r => { tasksMap[r.user_id] = parseInt(r.count); });

    const employees = byEmployee.rows.map(r => ({
      id: r.id,
      name: r.name,
      role: r.role,
      leads_total: parseInt(r.leads_total),
      leads_new: parseInt(r.leads_new),
      leads_in_progress: parseInt(r.leads_in_progress),
      leads_won: parseInt(r.leads_won),
      tasks_open: tasksMap[r.id] || 0,
    }));

    const departments = {};
    ['dispatcher', 'b2b_manager', 'mfl_manager'].forEach(role => {
      const list = employees.filter(e => e.role === role);
      departments[role] = {
        leads_total: list.reduce((s, e) => s + e.leads_total, 0),
        leads_new: list.reduce((s, e) => s + e.leads_new, 0),
        leads_in_progress: list.reduce((s, e) => s + e.leads_in_progress, 0),
        leads_won: list.reduce((s, e) => s + e.leads_won, 0),
        tasks_open: list.reduce((s, e) => s + e.tasks_open, 0),
        employees: list,
      };
    });

    res.json({ date_from: dateFrom, date_to: dateTo, departments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка статистики по подразделениям ОП' });
  }
});

// GET /api/stats/cs и /api/stats/mfl — статистика КС/МФЛ по заказам (orders)
function deptOrdersHandler(role) {
  return async (req, res) => {
    try {
      const { date_from, date_to, legal_entity, client_name, status } = req.query;

      const conditions = [`u.role = $1`];
      const params = [role];
      let i = 2;

      if (date_from) { conditions.push(`o.created_at >= $${i++}`); params.push(date_from); }
      if (date_to) { conditions.push(`o.created_at < ($${i++}::date + INTERVAL '1 day')`); params.push(date_to); }
      if (legal_entity) { conditions.push(`o.legal_entity = $${i++}`); params.push(legal_entity); }
      if (client_name) { conditions.push(`c.name ILIKE $${i++}`); params.push(`%${client_name}%`); }
      if (status) {
        const statuses = Array.isArray(status) ? status : [status];
        conditions.push(`o.status = ANY($${i++})`);
        params.push(statuses);
      }

      const where = conditions.join(' AND ');

      const metricsQ = await pool.query(`
        SELECT
          COALESCE(SUM(o.revenue), 0) as revenue,
          COALESCE(SUM(o.net_profit), 0) as net_profit,
          COALESCE(SUM(o.executor_cost), 0) as executor_cost,
          COUNT(*) as orders_count,
          COALESCE(AVG(o.revenue), 0) as avg_check
        FROM orders o
        JOIN users u ON u.id = o.manager_id
        LEFT JOIN clients c ON c.id = o.client_id
        WHERE ${where}
      `, params);

      const dailyQ = await pool.query(`
        SELECT DATE(o.created_at) as day,
          COALESCE(SUM(o.revenue), 0) as revenue,
          COALESCE(SUM(o.net_profit), 0) as net_profit
        FROM orders o
        JOIN users u ON u.id = o.manager_id
        LEFT JOIN clients c ON c.id = o.client_id
        WHERE ${where}
        GROUP BY DATE(o.created_at)
        ORDER BY day
      `, params);

      const managersQ = await pool.query(`
        SELECT u.id, u.name,
          COALESCE(SUM(o.revenue), 0) as revenue,
          COALESCE(SUM(o.revenue) FILTER (WHERE o.invoice_paid = false), 0) as revenue_no_invoice,
          COALESCE(SUM(o.executor_cost), 0) as executor_cost,
          COUNT(DISTINCT o.id) as orders_count,
          COALESCE(SUM(o.net_profit), 0) as net_profit,
          COALESCE(AVG(o.revenue), 0) as avg_check
        FROM orders o
        JOIN users u ON u.id = o.manager_id
        LEFT JOIN clients c ON c.id = o.client_id
        WHERE ${where}
        GROUP BY u.id, u.name
        ORDER BY revenue DESC
      `, params);

      const m = metricsQ.rows[0];
      const revenue = Number(m.revenue);
      const netProfit = Number(m.net_profit);

      res.json({
        metrics: {
          revenue,
          net_profit: netProfit,
          executor_cost: Number(m.executor_cost),
          orders_count: parseInt(m.orders_count),
          avg_check: Math.round(Number(m.avg_check)),
          profit_pct: revenue ? Math.round((netProfit / revenue) * 100) : 0,
        },
        daily: dailyQ.rows.map(r => ({
          day: r.day,
          revenue: Number(r.revenue),
          net_profit: Number(r.net_profit),
        })),
        managers: managersQ.rows.map(r => {
          const rev = Number(r.revenue);
          const np = Number(r.net_profit);
          return {
            id: r.id,
            name: r.name,
            revenue: rev,
            revenue_no_invoice: Number(r.revenue_no_invoice),
            executor_cost: Number(r.executor_cost),
            people: 0,
            net_profit: np,
            profit_pct: rev ? Math.round((np / rev) * 100) : 0,
            orders_count: parseInt(r.orders_count),
            avg_check: Math.round(Number(r.avg_check)),
          };
        }),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Ошибка статистики подразделения' });
    }
  };
}

router.get('/cs', deptOrdersHandler('cs_manager'));
router.get('/mfl', deptOrdersHandler('mfl_manager'));

module.exports = router;

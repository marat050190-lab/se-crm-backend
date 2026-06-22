require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const pool = require('./db/pool');
const { fetchRecentCalls } = require('./services/beeline');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3001;

// Экспортируем io для использования в routes
app.set('io', io);

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/users', require('./routes/users'));
app.use('/api/beeline', require('./routes/beeline'));
app.use('/api/migrate', require('./routes/migrate'));
app.use('/api/stats', require('./routes/stats'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// Socket.io
io.on('connection', (socket) => {
  console.log('Socket подключён:', socket.id);
  socket.on('disconnect', () => {
    console.log('Socket отключён:', socket.id);
  });
});

// Polling Билайн каждые 5 минут
cron.schedule('*/5 * * * *', () => {
  if (process.env.BEELINE_API_TOKEN) {
    fetchRecentCalls();
  }
});

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('✓ База данных подключена');

    const fs = require('fs');
    const path = require('path');
    const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('✓ Схема БД применена');

    server.listen(PORT, () => {
      console.log(`✓ SE CRM Backend запущен на порту ${PORT}`);
      console.log(`  Webhook URL: POST /api/beeline/webhook?token=YOUR_SECRET`);
    });
  } catch (err) {
    console.error('Ошибка запуска:', err);
    process.exit(1);
  }
}

start();

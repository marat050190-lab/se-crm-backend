const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const pool = require('../db/pool');

const MAILBOXES = [
  {
    user: 'info@standart-express.ru',
    password: 'DHmXy9WV1DEIFoW7Y0nz',
    host: 'imap.mail.ru',
    port: 993,
    tls: true,
  }
];

async function fetchEmails(io) {
  for (const mailbox of MAILBOXES) {
    try {
      const config = {
        imap: {
          user: mailbox.user,
          password: mailbox.password,
          host: mailbox.host,
          port: mailbox.port,
          tls: mailbox.tls,
          tlsOptions: { rejectUnauthorized: false },
          authTimeout: 10000,
        }
      };

      const connection = await imaps.connect(config);
      await connection.openBox('INBOX');

      // Ищем непрочитанные письма за последние 7 дней
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const searchCriteria = ['UNSEEN', ['SINCE', since]];
      const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: true };

      const messages = await connection.search(searchCriteria, fetchOptions);
      console.log(`[EMAIL] ${mailbox.user}: найдено ${messages.length} новых писем`);

      for (const msg of messages) {
        try {
          const all = msg.parts.find(p => p.which === '');
          const parsed = await simpleParser(all.body);

          const fromEmail = parsed.from?.value?.[0]?.address || '';
          const fromName = parsed.from?.value?.[0]?.name || '';
          const subject = parsed.subject || '(без темы)';
          const text = parsed.text || parsed.html || '';
          const messageId = parsed.messageId || Date.now().toString();

          // Проверяем не создавали ли уже лид из этого письма
          const exists = await pool.query(
            'SELECT id FROM leads WHERE beeline_call_id = $1',
            ['email_' + messageId]
          );
          if (exists.rows.length > 0) continue;

          // Генерируем номер лида
          const numRes = await pool.query("SELECT lead_number FROM leads ORDER BY id DESC LIMIT 1");
          let leadNumber = 'SE-0001';
          if (numRes.rows.length) {
            const last = numRes.rows[0].lead_number;
            const num = parseInt(last.replace('SE-', '')) + 1;
            leadNumber = `SE-${String(num).padStart(4, '0')}`;
          }

          // Создаём лид
          const result = await pool.query(`
            INSERT INTO leads (
              lead_number, client_name, client_phone,
              client_type, source, email_source,
              comment, status, beeline_call_id
            ) VALUES ($1, $2, $3, $4, 'email', $5, $6, 'transferred_b2b', $7)
            RETURNING *
          `, [
            leadNumber,
            fromName || fromEmail,
            fromEmail,
            'legal',
            mailbox.user,
            `Тема: ${subject}\n\n${text.slice(0, 1000)}`,
            'email_' + messageId,
          ]);

          const lead = result.rows[0];

          // История
          await pool.query(`
            INSERT INTO lead_history (lead_id, user_id, action, comment)
            VALUES ($1, NULL, 'created', $2)
          `, [lead.id, `Создан из email: ${subject} (от ${fromEmail})`]);

          console.log(`[EMAIL] Создан лид ${leadNumber} из письма от ${fromEmail}`);

          // Socket.io уведомление всем B2B менеджерам
          if (io) {
            io.emit('new_email_lead', {
              leadId: lead.id,
              leadNumber,
              from: fromEmail,
              fromName: fromName || fromEmail,
              subject,
              mailbox: mailbox.user,
            });
          }
        } catch (msgErr) {
          console.error('[EMAIL] Ошибка обработки письма:', msgErr.message);
        }
      }

      await connection.end();
    } catch (err) {
      console.error(`[EMAIL] Ошибка подключения к ${mailbox.user}:`, err.message);
    }
  }
}

module.exports = { fetchEmails };

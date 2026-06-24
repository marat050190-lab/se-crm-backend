const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const pool = require('../db/pool');
const { notifyNewEmail } = require('./telegram');

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

      const since = new Date();
      since.setDate(since.getDate() - 7);
      const searchCriteria = ['UNSEEN', ['SINCE', since]];
      const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], markSeen: false };

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

          const exists = await pool.query(
            'SELECT id FROM leads WHERE beeline_call_id = $1',
            ['email_' + messageId]
          );
          if (exists.rows.length > 0) continue;

          // Проверка дублей по email за 14 дней
          const dupCheck = await pool.query(
            `SELECT id, lead_number FROM leads WHERE client_phone = $1 AND source = 'email' AND created_at > NOW() - INTERVAL '14 days' ORDER BY id DESC LIMIT 1`,
            [fromEmail]
          );
          if (dupCheck.rows.length > 0) {
            const existingLead = dupCheck.rows[0];
            await pool.query(
              `INSERT INTO lead_history (lead_id, user_id, action, comment) VALUES ($1, NULL, 'note', $2)`,
              [existingLead.id, 'Новое письмо в переписке: ' + subject + '\n\n' + text.slice(0, 500)]
            );
            console.log('[EMAIL] Дубль от ' + fromEmail + ' → добавлено в историю лида ' + existingLead.lead_number);
            continue;
          }

          const numRes = await pool.query("SELECT lead_number FROM leads ORDER BY id DESC LIMIT 1");
          let leadNumber = 'SE-0001';
          if (numRes.rows.length) {
            const last = numRes.rows[0].lead_number;
            const num = parseInt(last.replace('SE-', '')) + 1;
            leadNumber = `SE-${String(num).padStart(4, '0')}`;
          }

          const result = await pool.query(`
            INSERT INTO leads (
              lead_number, client_name, client_phone,
              client_type, source, email_source,
              comment, status, beeline_call_id
            ) VALUES ($1, $2, $3, $4, 'email', $5, $6, 'transferred_b2b', $7)
            RETURNING *
          `, [
            leadNumber, fromName || fromEmail, fromEmail,
            'legal', mailbox.user,
            'Тема: ' + subject + '\n\n' + text.slice(0, 1000),
            'email_' + messageId,
          ]);

          const lead = result.rows[0];

          await pool.query(`
            INSERT INTO lead_history (lead_id, user_id, action, comment)
            VALUES ($1, NULL, 'created', $2)
          `, [lead.id, 'Создан из email: ' + subject + ' (от ' + fromEmail + ')']);

          console.log('[EMAIL] Создан лид ' + leadNumber + ' из письма от ' + fromEmail);

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

          // Telegram уведомление B2B менеджерам
          await notifyNewEmail(fromEmail, fromName || fromEmail, subject, lead.id, leadNumber, mailbox.user);

        } catch (msgErr) {
          console.error('[EMAIL] Ошибка обработки письма:', msgErr.message);
        }
      }

      await connection.end();
    } catch (err) {
      console.error('[EMAIL] Ошибка подключения к ' + mailbox.user + ':', err.message);
    }
  }
}

module.exports = { fetchEmails };

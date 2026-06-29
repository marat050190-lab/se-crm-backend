const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.mail.ru',
  port: 465,
  secure: true,
  auth: {
    user: 'info@standart-express.ru',
    pass: process.env.SMTP_PASSWORD,
  },
});

async function sendEmail({ to, subject, text, html, attachments }) {
  return transporter.sendMail({
    from: '"Стандарт Экспресс" <info@standart-express.ru>',
    to,
    subject,
    text,
    html,
    attachments,
  });
}

module.exports = { sendEmail };

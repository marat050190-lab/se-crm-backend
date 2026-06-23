const axios = require('axios');

async function getPhoneRegion(phone) {
  if (!phone) return null;
  try {
    const digits = phone.replace(/\D/g, '');
    const num = digits.startsWith('7') ? digits : '7' + digits;
    const res = await axios.get(`https://numinfo.ru/api/${num}`, { timeout: 3000 });
    const d = res.data;
    if (d && d.region) {
      const op = d.operator || '';
      return d.region + (op ? ` (${op})` : '');
    }
    return null;
  } catch (err) {
    return null;
  }
}

module.exports = { getPhoneRegion };

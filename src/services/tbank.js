const axios = require('axios');

const TBANK_API_URL = 'https://business.tbank.ru/openapi/api/v1';
const TOKEN = process.env.TBANK_API_TOKEN;

const tbankApi = axios.create({
  baseURL: TBANK_API_URL,
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// Добавить самозанятого по ИНН и номеру телефона
async function addSelfEmployed(inn, phone) {
  const response = await tbankApi.post('/self-employed', {
    inn,
    phone: phone.replace(/\D/g, '')
  });
  return response.data;
}

// Получить информацию по самозанятому
async function getSelfEmployed(recipientId) {
  const response = await tbankApi.get(`/self-employed/${recipientId}`);
  return response.data;
}

// Создать и оплатить реестр выплат
async function createAndPayRegistry(items) {
  // items: [{ recipientId, amount, description }]
  const response = await tbankApi.post('/self-employed/payment-registry', {
    registryCreateType: 'IGNORE_ERRORS',
    payments: items.map(item => ({
      recipientId: item.recipientId,
      amount: Math.round(item.amount * 100), // в копейках
      description: item.description || 'Оплата услуг'
    }))
  });
  return response.data;
}

// Получить статус реестра
async function getRegistryStatus(registryId) {
  const response = await tbankApi.get(`/self-employed/payment-registry/${registryId}`);
  return response.data;
}

// Получить чеки по реестру
async function getReceipts(registryId) {
  const response = await tbankApi.post('/self-employed/payment-registry/receipts', {
    registryId
  });
  return response.data;
}

module.exports = { addSelfEmployed, getSelfEmployed, createAndPayRegistry, getRegistryStatus, getReceipts };

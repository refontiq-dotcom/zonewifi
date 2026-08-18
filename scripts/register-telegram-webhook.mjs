#!/usr/bin/env node
// ============================================================
// Script d'enregistrement du Webhook Telegram
// Usage: node scripts/register-telegram-webhook.mjs
// ============================================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!BOT_TOKEN || !APP_URL || !SECRET) {
  console.error('❌ Variables manquantes. Assurez-vous que votre .env.local est chargé.');
  console.error('   Requises: TELEGRAM_BOT_TOKEN, NEXT_PUBLIC_APP_URL, TELEGRAM_WEBHOOK_SECRET');
  process.exit(1);
}

const webhookUrl = `${APP_URL}/api/telegram/webhook`;

const res = await fetch(
  `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: SECRET,
      allowed_updates: ['callback_query'],
    }),
  }
);

const data = await res.json();

if (data.ok) {
  console.log('✅ Webhook Telegram enregistré avec succès !');
  console.log(`   URL: ${webhookUrl}`);
} else {
  console.error('❌ Erreur:', data.description);
}

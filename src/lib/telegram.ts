// ============================================================
// Helper Bot Telegram — ZoneWifi
// ============================================================

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;

// ============================================================
// Envoi du message d'alerte à l'admin lors d'un nouveau paiement
// ============================================================
export async function sendPaymentAlert(params: {
  transactionId: string;
  telephone: string;
  forfaitLabel: string;
  montant: number;
}): Promise<number> {
  const { transactionId, telephone, forfaitLabel, montant } = params;

  const text =
    `🔔 *Nouvelle demande de paiement*\n\n` +
    `📱 Client : \`${telephone}\`\n` +
    `📦 Forfait : *${forfaitLabel}*\n` +
    `💰 Montant : *${montant.toLocaleString('fr-FR')} FCFA*\n\n` +
    `_Vérifiez le paiement Wave avant de valider._`;

  const body = {
    chat_id: CHAT_ID,
    text,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '✅ Valider & Envoyer Code',
            callback_data: `approve:${transactionId}`,
          },
          {
            text: '❌ Refuser',
            callback_data: `refuse:${transactionId}`,
          },
        ],
      ],
    },
  };

  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram sendMessage failed: ${err}`);
  }

  const data = await res.json();
  return data.result.message_id as number;
}

// ============================================================
// Édition du message Telegram après validation ou refus
// ============================================================
export async function editPaymentMessage(params: {
  messageId: number;
  telephone: string;
  forfaitLabel: string;
  montant: number;
  approved: boolean;
  code?: string;
}): Promise<void> {
  const { messageId, telephone, forfaitLabel, montant, approved, code } = params;

  let text: string;
  if (approved) {
    text =
      `✅ *Paiement Validé*\n\n` +
      `📱 Client : \`${telephone}\`\n` +
      `📦 Forfait : *${forfaitLabel}*\n` +
      `💰 Montant : *${montant.toLocaleString('fr-FR')} FCFA*\n` +
      `🔑 Code attribué : \`${code}\``;
  } else {
    text =
      `❌ *Paiement Refusé*\n\n` +
      `📱 Client : \`${telephone}\`\n` +
      `📦 Forfait : *${forfaitLabel}*\n` +
      `💰 Montant : *${montant.toLocaleString('fr-FR')} FCFA*`;
  }

  await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      message_id: messageId,
      text,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [] }, // Supprime les boutons
    }),
  });
}

// ============================================================
// Répondre à un callback_query (évite le spinner infini sur Telegram)
// ============================================================
export async function answerCallbackQuery(
  callbackQueryId: string,
  text: string
): Promise<void> {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

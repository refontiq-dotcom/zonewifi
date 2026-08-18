// ============================================================
// POST /api/telegram/webhook
// Reçoit les clics sur les boutons Telegram (Valider / Refuser)
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { editPaymentMessage, answerCallbackQuery } from '@/lib/telegram';
import { FORFAITS } from '@/lib/types';

// Validation de la signature du webhook Telegram
function validateTelegramSignature(req: NextRequest): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return true; // Si pas configuré, on laisse passer (dev)
  const incoming = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
  return incoming === secret;
}

export async function POST(req: NextRequest) {
  // --- Vérification de la signature ---
  if (!validateTelegramSignature(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const update = await req.json();

    // On ne traite que les callback_query (clics sur les boutons)
    const cbq = update?.callback_query;
    if (!cbq) {
      return NextResponse.json({ ok: true });
    }

    const callbackId = cbq.id as string;
    const data = cbq.data as string; // ex: "approve:uuid" ou "refuse:uuid"
    const [action, transactionId] = data.split(':');

    if (!transactionId || !['approve', 'refuse'].includes(action)) {
      await answerCallbackQuery(callbackId, '❌ Action invalide');
      return NextResponse.json({ ok: true });
    }

    // --- Récupérer la transaction ---
    const { data: transaction, error: txError } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (txError || !transaction) {
      await answerCallbackQuery(callbackId, '❌ Transaction introuvable');
      return NextResponse.json({ ok: true });
    }

    if (transaction.statut !== 'En attente') {
      await answerCallbackQuery(callbackId, `ℹ️ Déjà traitée : ${transaction.statut}`);
      return NextResponse.json({ ok: true });
    }

    const forfait = FORFAITS.find((f) => f.profil === transaction.profil);
    const forfaitLabel = forfait?.label ?? transaction.profil;

    // ==========================================
    // CAS 1 : VALIDATION
    // ==========================================
    if (action === 'approve') {
      // Appel à la fonction SQL atomique (évite les race conditions)
      const { data: ticketCode, error: rpcError } = await supabaseAdmin
        .rpc('assign_ticket', {
          p_profil: transaction.profil,
          p_transaction_id: transactionId,
        });

      if (rpcError) {
        const message =
          rpcError.message.includes('NO_TICKET_AVAILABLE')
            ? '⚠️ Plus de tickets disponibles pour ce forfait !'
            : '❌ Erreur lors de l\'attribution du code';
        await answerCallbackQuery(callbackId, message);
        return NextResponse.json({ ok: true });
      }

      // Mettre à jour le message Telegram (supprimer les boutons)
      if (transaction.telegram_message_id) {
        await editPaymentMessage({
          messageId: transaction.telegram_message_id,
          telephone: transaction.telephone,
          forfaitLabel,
          montant: transaction.montant,
          approved: true,
          code: ticketCode,
        });
      }

      await answerCallbackQuery(callbackId, '✅ Code envoyé avec succès !');
    }

    // ==========================================
    // CAS 2 : REFUS
    // ==========================================
    if (action === 'refuse') {
      await supabaseAdmin
        .from('transactions')
        .update({ statut: 'Refusée' })
        .eq('id', transactionId);

      if (transaction.telegram_message_id) {
        await editPaymentMessage({
          messageId: transaction.telegram_message_id,
          telephone: transaction.telephone,
          forfaitLabel,
          montant: transaction.montant,
          approved: false,
        });
      }

      await answerCallbackQuery(callbackId, '❌ Paiement refusé');
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

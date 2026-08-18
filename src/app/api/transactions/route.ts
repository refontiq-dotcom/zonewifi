// ============================================================
// POST /api/transactions
// Crée une nouvelle demande client + alerte l'admin Telegram
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendPaymentAlert } from '@/lib/telegram';
import { FORFAITS } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { telephone, profil } = body as { telephone: string; profil: string };

    // --- Validation des entrées ---
    if (!telephone || !profil) {
      return NextResponse.json({ error: 'Champs manquants' }, { status: 400 });
    }

    const phoneRegex = /^(\+?221)?(7[06-8])\d{7}$/;
    if (!phoneRegex.test(telephone.replace(/\s/g, ''))) {
      return NextResponse.json(
        { error: 'Numéro de téléphone invalide' },
        { status: 400 }
      );
    }

    const forfait = FORFAITS.find((f) => f.profil === profil);
    if (!forfait) {
      return NextResponse.json({ error: 'Forfait invalide' }, { status: 400 });
    }

    // --- Vérifier qu'aucune transaction active n'existe déjà ---
    const { data: existing } = await supabaseAdmin
      .from('transactions')
      .select('id, statut')
      .eq('telephone', telephone)
      .eq('statut', 'En attente')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'Vous avez déjà une demande en cours', transactionId: existing.id },
        { status: 409 }
      );
    }

    // --- Créer la transaction en base ---
    const { data: transaction, error: insertError } = await supabaseAdmin
      .from('transactions')
      .insert({
        telephone: telephone.replace(/\s/g, ''),
        profil,
        montant: forfait.prix,
      })
      .select()
      .single();

    if (insertError || !transaction) {
      console.error('Insert error:', insertError);
      return NextResponse.json(
        { error: 'Erreur lors de la création de la demande' },
        { status: 500 }
      );
    }

    // --- Envoyer l'alerte Telegram ---
    try {
      const messageId = await sendPaymentAlert({
        transactionId: transaction.id,
        telephone: transaction.telephone,
        forfaitLabel: forfait.label,
        montant: forfait.prix,
      });

      // Sauvegarder l'ID du message Telegram pour pouvoir l'éditer plus tard
      await supabaseAdmin
        .from('transactions')
        .update({ telegram_message_id: messageId })
        .eq('id', transaction.id);
    } catch (tgErr) {
      console.error('Telegram alert failed (non-blocking):', tgErr);
      // Non bloquant : la transaction est créée même si Telegram échoue
    }

    return NextResponse.json(
      { transactionId: transaction.id, status: 'En attente' },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/transactions error:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

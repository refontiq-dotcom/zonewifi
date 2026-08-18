// ============================================================
// GET /api/transactions/[id]
// Polling de l'état d'une transaction (fallback si Realtime indisponible)
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (!id || id.length < 10) {
    return NextResponse.json({ error: 'ID invalide' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('id, statut, ticket_id, expires_at, tickets(code)')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Transaction introuvable' }, { status: 404 });
  }

  // Expose uniquement les champs nécessaires côté client
  return NextResponse.json({
    id: data.id,
    statut: data.statut,
    code: data.statut === 'Approuvée' ? (data as any).tickets?.code ?? null : null,
    expires_at: data.expires_at,
  });
}

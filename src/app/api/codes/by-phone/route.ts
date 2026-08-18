// ============================================================
// GET /api/codes/by-phone
// Retourne le dernier code attribué à un client (après validation
// du paiement par l'admin), pour que le client puisse le retrouver
// à tout moment depuis le portail.
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isValidIvorianPhone, normalizePhone } from '@/lib/phone';
import { FORFAITS } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get('telephone') ?? '';

    if (!isValidIvorianPhone(raw)) {
      return NextResponse.json(
        { error: 'Numéro de téléphone invalide' },
        { status: 400 }
      );
    }

    const telephone = normalizePhone(raw);

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('telephone, profil, montant, validated_at, tickets(code)')
      .eq('telephone', telephone)
      .eq('statut', 'Approuvée')
      .not('ticket_id', 'is', null)
      .order('validated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('by-phone error:', error);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }

    const row = data as {
      telephone: string;
      profil: string;
      montant: number;
      validated_at: string | null;
      tickets: { code: string } | { code: string }[] | null;
    };

    const ticket = Array.isArray(row.tickets) ? row.tickets[0] : row.tickets;

    if (!ticket?.code) {
      return NextResponse.json(
        { message: 'Aucun code trouvé pour ce numéro.' },
        { status: 404 }
      );
    }

    const forfait = FORFAITS.find((f) => f.profil === row.profil);

    return NextResponse.json({
      code: ticket.code,
      profil: row.profil,
      label: forfait?.label ?? row.profil,
      montant: row.montant,
      validated_at: row.validated_at,
    });
  } catch (err) {
    console.error('GET /api/codes/by-phone error:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

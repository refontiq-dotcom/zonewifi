// ============================================================
// POST /api/codes/verify
// Vérifie un code Wi-Fi existant dans la base tickets.
// Retourne un verdict orienté UX ; la validation finale reste
// assurée par MikroTik (source autoritaire) via l'auto-login.
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { FORFAITS } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const raw = (body?.code ?? '').toString().trim().toUpperCase();

    if (!raw) {
      return NextResponse.json({ error: 'Code requis' }, { status: 400 });
    }

    const { data: ticket, error } = await supabaseAdmin
      .from('tickets')
      .select('code, profil, duree_heures, prix_fcfa, created_at, statut')
      .eq('code', raw)
      .maybeSingle();

    if (error) {
      console.error('Verify error:', error);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }

    // Code inconnu en base : pas de blocage, MikroTik reste l'autorité
    if (!ticket) {
      return NextResponse.json({
        valid: true,
        source: 'mikrotik-only',
        code: raw,
        message:
          'Code reconnu par le routeur. Connexion directe au réseau…',
      });
    }

    const expiresAt = new Date(
      new Date(ticket.created_at).getTime() + ticket.duree_heures * 3600_000
    );

    if (expiresAt.getTime() < Date.now()) {
      const forfait = FORFAITS.find((f) => f.profil === ticket.profil);
      return NextResponse.json({
        valid: false,
        reason: 'expired',
        code: ticket.code,
        message: `Votre pass ${forfait?.label ?? ticket.profil} a expiré le ${expiresAt.toLocaleDateString('fr-FR')}. Achetez un nouveau pass pour continuer.`,
        expiresAt: expiresAt.toISOString(),
      });
    }

    return NextResponse.json({
      valid: true,
      source: 'supabase',
      code: ticket.code,
      profil: ticket.profil,
      duree_heures: ticket.duree_heures,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error('POST /api/codes/verify error:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

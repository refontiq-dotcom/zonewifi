// ============================================================
// Types TypeScript — ZoneWifi
// ============================================================

export type TicketStatut = 'Disponible' | 'Utilisé';
export type TransactionStatut = 'En attente' | 'Approuvée' | 'Refusée' | 'Expirée';

export interface Ticket {
  id: string;
  code: string;
  profil: Profil;
  duree_heures: number;
  prix_fcfa: number;
  statut: TicketStatut;
  created_at: string;
}

export interface Transaction {
  id: string;
  telephone: string;
  profil: Profil;
  montant: number;
  statut: TransactionStatut;
  ticket_id: string | null;
  telegram_message_id: number | null;
  created_at: string;
  validated_at: string | null;
  expires_at: string;
}

// ============================================================
// Configuration des forfaits (4 forfaits Wave réels)
// ============================================================

export type Profil = 'pass_3j' | 'pass_1s' | 'pass_2s' | 'pass_1m';

export interface ForfaitConfig {
  profil: Profil;
  label: string;
  duree: string;
  duree_heures: number;
  prix: number;
  waveUrl: string;
  emoji: string;
  popular?: boolean;
}

export const FORFAITS: ForfaitConfig[] = [
  {
    profil: 'pass_3j',
    label: 'Pass 3 Jours',
    duree: '72 heures',
    duree_heures: 72,
    prix: 500,
    waveUrl: process.env.NEXT_PUBLIC_WAVE_URL_3J ?? '#',
    emoji: '⚡',
  },
  {
    profil: 'pass_1s',
    label: 'Pass 1 Semaine',
    duree: '7 jours',
    duree_heures: 168,
    prix: 1000,
    waveUrl: process.env.NEXT_PUBLIC_WAVE_URL_1S ?? '#',
    emoji: '📅',
    popular: true,
  },
  {
    profil: 'pass_2s',
    label: 'Pass 2 Semaines',
    duree: '14 jours',
    duree_heures: 336,
    prix: 1500,
    waveUrl: process.env.NEXT_PUBLIC_WAVE_URL_2S ?? '#',
    emoji: '🚀',
  },
  {
    profil: 'pass_1m',
    label: 'Pass 1 Mois',
    duree: '30 jours',
    duree_heures: 720,
    prix: 3000,
    waveUrl: process.env.NEXT_PUBLIC_WAVE_URL_1M ?? '#',
    emoji: '👑',
  },
];

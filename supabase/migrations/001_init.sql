-- ============================================================
-- ZoneWifi — Migration initiale
-- ============================================================

-- Table des tickets Wi-Fi (stock de codes MikroTik pré-générés)
CREATE TABLE IF NOT EXISTS tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  profil      text NOT NULL CHECK (profil IN ('pass_3j', 'pass_1s', 'pass_2s', 'pass_1m')),
  duree_heures int NOT NULL,
  prix_fcfa   int NOT NULL,
  statut      text NOT NULL DEFAULT 'Disponible' CHECK (statut IN ('Disponible', 'Utilisé')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Table des transactions (demandes clients)
CREATE TABLE IF NOT EXISTS transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telephone           text NOT NULL,
  profil              text NOT NULL CHECK (profil IN ('pass_3j', 'pass_1s', 'pass_2s', 'pass_1m')),
  montant             int NOT NULL,
  statut              text NOT NULL DEFAULT 'En attente'
                        CHECK (statut IN ('En attente', 'Approuvée', 'Refusée', 'Expirée')),
  ticket_id           uuid REFERENCES tickets(id),
  telegram_message_id bigint,
  created_at          timestamptz NOT NULL DEFAULT now(),
  validated_at        timestamptz,
  expires_at          timestamptz NOT NULL DEFAULT (now() + interval '30 minutes')
);

-- Index pour accélérer les recherches fréquentes
CREATE INDEX IF NOT EXISTS idx_tickets_dispo ON tickets (profil, statut)
  WHERE statut = 'Disponible';
CREATE INDEX IF NOT EXISTS idx_transactions_statut ON transactions (statut, expires_at);

-- ============================================================
-- Fonction atomique d'attribution de ticket (sans race condition)
-- ============================================================
CREATE OR REPLACE FUNCTION assign_ticket(
  p_profil        text,
  p_transaction_id uuid
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_ticket_id   uuid;
  v_ticket_code text;
BEGIN
  -- Sélectionne et verrouille un ticket disponible atomiquement
  SELECT id, code
  INTO   v_ticket_id, v_ticket_code
  FROM   tickets
  WHERE  profil = p_profil
    AND  statut = 'Disponible'
  ORDER BY created_at
  LIMIT  1
  FOR UPDATE SKIP LOCKED;

  IF v_ticket_id IS NULL THEN
    RAISE EXCEPTION 'NO_TICKET_AVAILABLE';
  END IF;

  -- Marque le ticket comme utilisé
  UPDATE tickets
  SET    statut = 'Utilisé'
  WHERE  id = v_ticket_id;

  -- Associe le ticket à la transaction et la valide
  UPDATE transactions
  SET    statut       = 'Approuvée',
         ticket_id    = v_ticket_id,
         validated_at = now()
  WHERE  id = p_transaction_id;

  RETURN v_ticket_code;
END;
$$;

-- ============================================================
-- Activation de Realtime sur la table transactions
-- ============================================================
ALTER TABLE transactions REPLICA IDENTITY FULL;

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Seul le service_role (backend) peut tout lire/écrire
CREATE POLICY "service_role_all_tickets"
  ON tickets FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_transactions"
  ON transactions FOR ALL
  USING (auth.role() = 'service_role');

-- Le client anonyme peut lire sa propre transaction (par ID)
CREATE POLICY "anon_read_own_transaction"
  ON transactions FOR SELECT
  USING (true);  -- filtrage par ID côté API

-- ============================================================
-- Données de test (tickets d'exemple)
-- ============================================================
INSERT INTO tickets (code, profil, duree_heures, prix_fcfa) VALUES
  -- Pass 3 jours (500 FCFA)
  ('WIFI-3J-AA1', 'pass_3j',  72,  500),
  ('WIFI-3J-BB2', 'pass_3j',  72,  500),
  ('WIFI-3J-CC3', 'pass_3j',  72,  500),
  ('WIFI-3J-DD4', 'pass_3j',  72,  500),
  ('WIFI-3J-EE5', 'pass_3j',  72,  500),
  -- Pass 1 semaine (1000 FCFA)
  ('WIFI-1S-FF6', 'pass_1s', 168, 1000),
  ('WIFI-1S-GG7', 'pass_1s', 168, 1000),
  ('WIFI-1S-HH8', 'pass_1s', 168, 1000),
  ('WIFI-1S-II9', 'pass_1s', 168, 1000),
  ('WIFI-1S-JJ0', 'pass_1s', 168, 1000),
  -- Pass 2 semaines (1500 FCFA)
  ('WIFI-2S-KK1', 'pass_2s', 336, 1500),
  ('WIFI-2S-LL2', 'pass_2s', 336, 1500),
  ('WIFI-2S-MM3', 'pass_2s', 336, 1500),
  -- Pass 1 mois (3000 FCFA)
  ('WIFI-1M-NN4', 'pass_1m', 720, 3000),
  ('WIFI-1M-OO5', 'pass_1m', 720, 3000),
  ('WIFI-1M-PP6', 'pass_1m', 720, 3000)
ON CONFLICT (code) DO NOTHING;

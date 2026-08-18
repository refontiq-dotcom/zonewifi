// ============================================================
// Génère un fichier SQL propre pour Supabase
// - Accorde les permissions nécessaires
// - Supprime les faux tickets
// - Insère les vrais tickets MikroTik
// ============================================================
import { readFileSync, writeFileSync } from 'fs';

// --- Mapping profils ---
const PROFIL_MAP = {
  'Pass 3 Jours':   { profil: 'pass_3j', duree_heures: 72,  prix_fcfa: 500 },
  'Pass 1 Semaine': { profil: 'pass_1s', duree_heures: 168, prix_fcfa: 1000 },
  'Pass 2 Semaine': { profil: 'pass_2s', duree_heures: 336, prix_fcfa: 1500 },
  'Pass 1 Mois':    { profil: 'pass_1m', duree_heures: 720, prix_fcfa: 3000 },
};

// --- Lire tickes.sql ---
const sqlContent = readFileSync('tickes.sql', 'utf8');

// Normaliser les retours ligne dans les valeurs false
const normalized = sqlContent
  .replace(/f\s*\n\s*alse/g, 'false')
  .replace(/fal\s*\n\s*se/g, 'false')
  .replace(/fa\s*\n\s*lse/g, 'false')
  .replace(/fl\s*\n\s*se/g, 'false');

// Extraire les tickets
const tickets = [];
const regex = /VALUES\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(?:false|true)\s*\)/g;
let match;

while ((match = regex.exec(normalized)) !== null) {
  const code = match[1].trim();
  const profileLabel = match[2].trim();

  if (code.toLowerCase() === 'user2') continue;

  const format = PROFIL_MAP[profileLabel];
  if (!format) {
    console.warn(`⚠️ Profil inconnu pour ${code}: "${profileLabel}"`);
    continue;
  }

  tickets.push({
    code,
    profil: format.profil,
    duree_heures: format.duree_heures,
    prix_fcfa: format.prix_fcfa,
  });
}

console.log(`📦 ${tickets.length} tickets extraits`);

// --- Générer le SQL ---
let sql = `-- ============================================================
-- ZoneWifi : Synchronisation des tickets MikroTik
-- Supprime les faux codes et insère les vrais codes
-- ============================================================

-- 1. Permissions : backend (service_role) + client (anon/authenticated)
GRANT ALL ON TABLE public.tickets TO service_role;
GRANT ALL ON TABLE public.transactions TO service_role;
GRANT SELECT ON TABLE public.tickets TO anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.transactions TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, USAGE ON SEQUENCE paytickets_id_seq TO anon, authenticated, service_role;

-- 2. Supprimer les faux tickets (ceux de test WIFI-XXX + user2)
DELETE FROM transactions WHERE ticket_id IS NOT NULL AND ticket_id IN (
  SELECT id FROM tickets
  WHERE code NOT IN (${tickets.map((t) => `'${t.code}'`).join(', ')})
);

DELETE FROM tickets
WHERE code NOT IN (${tickets.map((t) => `'${t.code}'`).join(', ')});

-- 3. Supprimer aussi les vrais codes déjà présents pour une réinsertion propre
-- (conserve les contraintes UNIQUE)
DELETE FROM tickets
WHERE code IN (${tickets.map((t) => `'${t.code}'`).join(', ')});

-- 4. Insérer les vrais codes
INSERT INTO tickets (code, profil, duree_heures, prix_fcfa) VALUES
`;

// Ajouter chaque ticket
tickets.forEach((t, i) => {
  sql += `  ('${t.code}', '${t.profil}', ${t.duree_heures}, ${t.prix_fcfa})`;
  if (i < tickets.length - 1) sql += ',';
  sql += '\n';
});

sql += `ON CONFLICT (code) DO NOTHING;

-- 5. Vérification
SELECT 'Total' AS type, count(*) FROM tickets
UNION ALL
SELECT profil, count(*) FROM tickets GROUP BY profil
ORDER BY type;
`;

writeFileSync('supabase/migrations/002_sync_tickets.sql', sql);
console.log('✅ Fichier généré: supabase/migrations/002_sync_tickets.sql');
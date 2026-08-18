// ============================================================
// Script : Synchroniser les tickets MikroTik vers Supabase
// - Supprime les faux codes de test (WIFI-XXX, user2)
// - Insère les vrais codes depuis tickes.sql
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// --- Charger .env.local ---
const envContent = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Variables Supabase manquantes dans .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

// Mapping profils (libellés MikroTik -> valeurs Supabase)
const PROFIL_MAP = {
  'Pass 3 Jours':   { profil: 'pass_3j', duree_heures: 72,  prix_fcfa: 500 },
  'Pass 1 Semaine': { profil: 'pass_1s', duree_heures: 168, prix_fcfa: 1000 },
  'Pass 2 Semaine': { profil: 'pass_2s', duree_heures: 336, prix_fcfa: 1500 },
  'Pass 1 Mois':    { profil: 'pass_1m', duree_heures: 720, prix_fcfa: 3000 },
};

// --- Lire le fichier tickes.sql et extraire les tickets ---
console.log('📖 Lecture de tickes.sql...');
const sqlContent = readFileSync('tickes.sql', 'utf8');

// Le fichier contient des retours ligne dans les valeurs : normaliser d'abord
const normalized = sqlContent
  .replace(/f\s*\n\s*alse/g, 'false')
  .replace(/fal\s*\n\s*se/g, 'false')
  .replace(/fa\s*\n\s*lse/g, 'false');

// Extraction des INSERT INTO tickets VALUES ('code', 'profil', false);
const tickets = [];
const regex = /VALUES\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(?:false|true)\s*\)/g;
let match;

while ((match = regex.exec(normalized)) !== null) {
  const code = match[1].trim();
  const profileLabel = match[2].trim();

  // Ignorer le faux code "user2"
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
    statut: 'Disponible',
  });
}

console.log(`📦 ${tickets.length} vrais tickets MikroTik extraits`);

// --- Récupérer les tickets actuels ---
const { data: existingTickets, error: fetchError } = await supabase
  .from('tickets')
  .select('id, code');

if (fetchError) {
  console.error('❌ Erreur récupération tickets:', fetchError.message);
  process.exit(1);
}

// --- Identifier les faux codes (ceux qui ne sont pas dans la liste réelle) ---
const realCodes = new Set(tickets.map(t => t.code));
const fakeTickets = (existingTickets ?? []).filter(t => !realCodes.has(t.code));

console.log(`\n🗑️ ${fakeTickets.length} faux tickets à supprimer...`);

// Supprimer les faux tickets (y compris ceux qui sont "Utilisé" liés à des transactions)
let deletedFake = 0;
for (const fake of fakeTickets) {
  // D'abord détacher la transaction si elle référence ce ticket
  const { error: refError } = await supabase
    .from('transactions')
    .update({ ticket_id: null })
    .eq('ticket_id', fake.id);

  if (refError) console.error(`⚠️ Erreur détachement ${fake.code}: ${refError.message}`);

  const { error: delError } = await supabase
    .from('tickets')
    .delete()
    .eq('id', fake.id);

  if (delError) {
    console.error(`❌ Échec suppression ${fake.code}: ${delError.message}`);
  } else {
    deletedFake++;
    console.log(`  ✓ Supprimé: ${fake.code}`);
  }
}

// --- Insérer les vrais tickets MikroTik ---
console.log('\n📥 Insertion des vrais tickets MikroTik...');

const BATCH = 50;
let insertedCount = 0;

for (let i = 0; i < tickets.length; i += BATCH) {
  const batch = tickets.slice(i, i + BATCH);
  const { error } = await supabase
    .from('tickets')
    .upsert(batch, { onConflict: 'code', ignoreDuplicates: false });

  if (error) {
    console.error(`❌ Erreur insertion lot ${i}-${i + batch.length}: ${error.message}`);
  } else {
    insertedCount += batch.length;
    console.log(`  ✓ ${batch.length} tickets insérés (lot ${i + 1}-${i + batch.length})`);
  }
}

// --- Vérification finale ---
console.log('\n=== VÉRIFICATION FINALE ===');

const { count: totalCount, error: countError } = await supabase
  .from('tickets')
  .select('id', { count: 'exact', head: true });

if (countError) {
  console.error('❌ Erreur comptage:', countError.message);
} else {
  console.log(`📊 Total tickets en base: ${totalCount}`);
}

// Résumé par profil
for (const [label, fmt] of Object.entries(PROFIL_MAP)) {
  const { count } = await supabase
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('profil', fmt.profil)
    .eq('statut', 'Disponible');

  if (count !== null) {
    console.log(`   ${label}: ${count} disponibles`);
  }
}

console.log(`\n✅ Terminé !`);
console.log(`   - ${deletedFake} faux tickets supprimés`);
console.log(`   - ${insertedCount} tickets réels insérés/mis à jour`);
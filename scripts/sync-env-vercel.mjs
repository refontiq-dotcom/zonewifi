// ============================================================
// Script : Synchroniser .env.local vers Vercel (créer/mettre à jour)
// ============================================================
import { readFileSync } from 'fs';

const VERCEL_TOKEN = process.argv[2] || process.env.VERCEL_TOKEN;
const PROJECT_ID = 'prj_7fZT6EcetFXtrajJCFBGE4SUKz8R';
const TEAM_ID = 'team_IDGp07vFnHOzTDBfkMXFILbx';

if (!VERCEL_TOKEN) {
  console.error('❌ Token Vercel manquant. Usage: node scripts/sync-env-vercel.mjs <TOKEN>');
  process.exit(1);
}

// Lire .env.local
const envContent = readFileSync('.env.local', 'utf8');
const envVars = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const value = trimmed.slice(eqIdx + 1).trim();
  if (key && value) envVars[key] = value;
}

console.log(`📦 ${Object.keys(envVars).length} variables trouvées dans .env.local`);

async function upsertEnv(key, value) {
  // 1. Supprimer les anciennes valeurs de la variable
  const listRes = await fetch(`https://api.vercel.com/v9/projects/${PROJECT_ID}/env?key=${key}&teamId=${TEAM_ID}`, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  });
  if (listRes.ok) {
    const listData = await listRes.json();
    for (const env of listData.envs || []) {
      await fetch(`https://api.vercel.com/v9/projects/${PROJECT_ID}/env/${env.id}?teamId=${TEAM_ID}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
      });
    }
  }

  // 2. Créer la nouvelle variable pour production + preview + development
  const isPublic = key.startsWith('NEXT_PUBLIC_');
  const res = await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      key,
      value,
      type: isPublic ? 'encrypted' : 'encrypted',
      target: isPublic ? ['production', 'preview', 'development'] : ['production', 'preview'],
    }),
  });

  if (res.ok) {
    console.log(`✅ ${key} ${isPublic ? '(public)' : '(secret)'}`);
  } else {
    const err = await res.text();
    console.error(`❌ ${key}: ${err}`);
  }
}

for (const [key, value] of Object.entries(envVars)) {
  await upsertEnv(key, value);
}

console.log(`\n🎉 ${Object.keys(envVars).length} variables synchronisées sur Vercel !`);
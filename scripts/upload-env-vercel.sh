#!/bin/bash
# ============================================================
# Script : Envoyer .env.local vers Vercel (une seule fois)
# ============================================================
set -euo pipefail

VERCEL_TOKEN="$1"
PROJECT_ID="prj_7fZT6EcetFXtrajJCFBGE4SUKz8R"
TEAM_ID="team_IDGp07vFnHOzTDBfkMXFILbx"

# Lire le fichier et envoyer chaque variable
while IFS= read -r line || [[ -n "$line" ]]; do
  # Ignorer les lignes vides et commentaires
  [[ -z "$line" || "$line" == \#* ]] && continue

  # Extraire clé et valeur
  key="${line%%=*}"
  value="${line#*=}"

  # Nettoyer les valeurs entre guillemets ou apostrophes
  value="${value%\"}"
  value="${value#\"}"

  # Sauter si pas de valeur
  [[ -z "$value" ]] && continue

  # Cible: preview + production + development pour les variables publiques Next.js
  if [[ "$key" == NEXT_PUBLIC_* ]]; then
    target='["production","preview","development"]'
  else
    target='["production","preview"]'
  fi

  # Construction JSON
  payload=$(printf '{"key":"%s","value":"%s","type":"encrypted","target":%s}' "$key" "$value" "$target")

  echo "→ Envoi de $key..."
  response=$(curl -s -X POST "https://api.vercel.com/v10/projects/$PROJECT_ID/env?teamId=$TEAM_ID" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload")

  if echo "$response" | grep -q '"failed"'; then
    echo "✓ $key créée"
  else
    echo "✗ Échec pour $key : $response"
  fi
done < .env.local

echo ""
echo "Terminé."
</｜DSML｜>
</write_to_file>
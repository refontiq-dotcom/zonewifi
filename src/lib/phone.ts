// ============================================================
// Helpers numéro de téléphone — Côte d'Ivoire (+225)
// ============================================================

// Accepte : 0707070707, 07 07 07 07 07, +2250707070707, +225 07 07 07 07 07
const IVORIAN_PHONE_REGEX = /^(\+225)?0?[1-9]\d{8}$/;

export function normalizePhone(value: string): string {
  const digits = value.replace(/\s+/g, '');
  if (digits.startsWith('+225')) return digits.slice(4);
  return digits;
}

export function isValidIvorianPhone(value: string): boolean {
  if (!value) return false;
  return IVORIAN_PHONE_REGEX.test(normalizePhone(value));
}

'use client';

import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { FORFAITS, type ForfaitConfig } from '@/lib/types';
import { isValidIvorianPhone, normalizePhone } from '@/lib/phone';

// ============================================================
// Types d'état
// ============================================================
type Screen = 'landing' | 'waiting' | 'success' | 'refused' | 'error';
type Tab = 'buy' | 'connect' | 'codes';

type VerifyState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok'; message?: string }
  | { status: 'expired'; message: string }
  | { status: 'error'; message: string };

type LookupState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'found'; code: string; label?: string; montant?: number }
  | { status: 'none' }
  | { status: 'error'; message: string };

// ============================================================
// Hook Realtime Supabase + polling de fallback
// ============================================================
function useTransactionStatus(
  transactionId: string | null,
  onApproved: (code: string) => void,
  onRefused: () => void
) {
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!transactionId) return;
    try {
      const res = await fetch(`/api/transactions/${transactionId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.statut === 'Approuvée' && data.code) {
        onApproved(data.code);
      } else if (data.statut === 'Refusée') {
        onRefused();
      }
    } catch {
      /* silencieux */
    }
  }, [transactionId, onApproved, onRefused]);

  useEffect(() => {
    if (!transactionId) return;

    // --- Supabase Realtime (méthode principale) ---
    const channel = supabaseBrowser
      .channel(`tx-${transactionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'transactions',
          filter: `id=eq.${transactionId}`,
        },
        async (payload) => {
          const row = payload.new as { statut: string };
          if (row.statut === 'Approuvée') {
            // Récupère le code via l'API (Realtime n'inclut pas les jointures)
            await fetchStatus();
          } else if (row.statut === 'Refusée') {
            onRefused();
          }
        }
      )
      .subscribe();

    // --- Polling de fallback (toutes les 5 secondes) ---
    pollingRef.current = setInterval(fetchStatus, 5000);

    return () => {
      supabaseBrowser.removeChannel(channel);
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [transactionId, fetchStatus, onRefused]);
}

// ============================================================
// Composant Toast
// ============================================================
function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div className={`toast${visible ? ' show' : ''}`} role="alert">
      {message}
    </div>
  );
}

// ============================================================
// Champ téléphone (Côte d'Ivoire +225)
// ============================================================
function PhoneField({
  id,
  value,
  error,
  onChange,
  onBlur,
}: {
  id: string;
  value: string;
  error: string;
  onChange: (val: string) => void;
  onBlur?: () => void;
}) {
  return (
    <div className="phone-input-wrapper">
      <span className="phone-prefix">🇨🇮 +225</span>
      <input
        id={id}
        type="tel"
        className="phone-input"
        placeholder="07 00 00 00 00"
        value={value}
        maxLength={16}
        inputMode="tel"
        autoComplete="tel"
        aria-label="Numéro de téléphone"
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value.replace(/[^\d\s+]/g, ''))}
        onBlur={onBlur}
      />
      {error && (
        <p id={`${id}-error`} className="field-error">
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}

// ============================================================
// Page principale — Portail Captif
// ============================================================
export default function PortailCaptif() {
  const [screen, setScreen] = useState<Screen>('landing');
  const [tab, setTab] = useState<Tab>('buy');

  // --- Parcours "Acheter un pass" ---
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [selectedForfait, setSelectedForfait] = useState<ForfaitConfig | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [wifiCode, setWifiCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Parcours "J'ai déjà un code" ---
  const [code, setCode] = useState('');
  const [verify, setVerify] = useState<VerifyState>({ status: 'idle' });

  // --- Parcours "Mes codes" ---
  const [codeLookup, setCodeLookup] = useState<LookupState>({ status: 'idle' });

  const [toast, setToast] = useState({ message: '', visible: false });

  // Récupère les paramètres MikroTik depuis l'URL (injectés par le routeur)
  const getMikroTikParams = () => {
    if (typeof window === 'undefined') return {};
    const p = new URLSearchParams(window.location.search);
    return {
      dst: p.get('dst') ?? '',
      mac: p.get('mac') ?? '',
      ip: p.get('ip') ?? '',
      'link-login-only': p.get('link-login-only') ?? '',
    };
  };

  const mkParams = typeof window !== 'undefined' ? getMikroTikParams() : {};

  // --- Toast helper ---
  const showToast = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3500);
  };

  // --- Validation du numéro ivoirien ---
  const validatePhone = (value: string): boolean => {
    const ok = isValidIvorianPhone(value);
    setPhoneError(ok ? '' : 'Format invalide. Ex : 07 00 00 00 00');
    return ok;
  };

  const handlePhoneChange = (val: string) => {
    setPhone(val);
    if (phoneError) validatePhone(val);
    setSelectedForfait(null);
    setCodeLookup({ status: 'idle' });
  };

  // --- Auto-connexion MikroTik (formulaire caché HTTP PAP) ---
  const scheduleMikrotikLogin = (codeToUse: string) => {
    setTimeout(() => {
      const form = document.getElementById('mikrotik-form') as HTMLFormElement | null;
      if (form) {
        (form.querySelector('[name="username"]') as HTMLInputElement).value = codeToUse;
        (form.querySelector('[name="password"]') as HTMLInputElement).value = codeToUse;
        form.submit();
      }
    }, 2500); // Laisse l'utilisateur voir le code 2,5 secondes
  };

  // --- Parcours 1 : bouton Payer d'un forfait (ouvre Wave) ---
  const handleForfaitClick = (forfait: ForfaitConfig) => {
    if (!validatePhone(phone)) {
      showToast('⚠️ Entrez votre numéro avant de payer');
      return;
    }
    setSelectedForfait(forfait);
    // Redirige vers le lien de paiement Wave intégré (montant fixe)
    window.open(forfait.waveUrl, '_blank', 'noopener,noreferrer');
  };

  // --- Parcours 1 : déclaration du paiement ---
  const handlePaymentDeclared = async () => {
    if (!selectedForfait) return;
    if (!validatePhone(phone)) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telephone: normalizePhone(phone),
          profil: selectedForfait.profil,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        // Demande déjà en cours — on reprend le suivi
        setTransactionId(data.transactionId);
        setScreen('waiting');
        return;
      }

      if (!res.ok) {
        showToast(`❌ ${data.error ?? 'Erreur lors de la soumission'}`);
        return;
      }

      setTransactionId(data.transactionId);
      setScreen('waiting');
    } catch {
      showToast('❌ Erreur réseau, réessayez');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Parcours 2 : connexion avec un code existant ---
  const handleCodeConnect = async () => {
    const clean = code.replace(/\s+/g, '').toUpperCase();
    if (!clean) {
      setVerify({ status: 'error', message: 'Veuillez saisir votre code Wi-Fi.' });
      return;
    }
    if (clean.length < 6) {
      setVerify({ status: 'error', message: 'Ce code semble trop court. Vérifiez-le.' });
      return;
    }

    setVerify({ status: 'checking' });
    try {
      const res = await fetch('/api/codes/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: clean }),
      });

      const data = await res.json();

      if (data && data.error && res.status >= 400) {
        setVerify({
          status: 'error',
          message: data.error ?? 'Erreur lors de la vérification du code.',
        });
        return;
      }

      if (data.valid) {
        setVerify({ status: 'ok', message: data.message });
        setWifiCode(clean);
        setScreen('success');
        scheduleMikrotikLogin(clean);
      } else {
        setVerify({
          status: 'expired',
          message: data.message ?? 'Ce code n\'est pas utilisable.',
        });
      }
    } catch {
      setVerify({
        status: 'error',
        message: 'Erreur réseau. Vérifiez votre connexion et réessayez.',
      });
    }
  };

  // --- Parcours 3 : retrouver son code après achat ---
  const handleFindCode = async () => {
    if (!validatePhone(phone)) return;

    setCodeLookup({ status: 'loading' });
    try {
      const res = await fetch(
        `/api/codes/by-phone?telephone=${encodeURIComponent(normalizePhone(phone))}`
      );
      const data = await res.json();

      if (res.status === 404) {
        setCodeLookup({ status: 'none' });
        return;
      }
      if (!res.ok) {
        setCodeLookup({
          status: 'error',
          message: data.error ?? 'Erreur lors de la recherche.',
        });
        return;
      }

      setCodeLookup({
        status: 'found',
        code: data.code,
        label: data.label,
        montant: data.montant,
      });
    } catch {
      setCodeLookup({
        status: 'error',
        message: 'Erreur réseau. Réessayez.',
      });
    }
  };

  // --- Se connecter avec le code retrouvé ---
  const connectWithFoundCode = () => {
    if (codeLookup.status !== 'found') return;
    setCode(codeLookup.code);
    setVerify({ status: 'idle' });
    setTab('connect');
  };

  // --- Callbacks du hook Realtime ---
  const handleApproved = useCallback(
    (code: string) => {
      setWifiCode(code);
      setScreen('success');
      scheduleMikrotikLogin(code);
    },
    []
  );

  const handleRefused = useCallback(() => {
    setScreen('refused');
  }, []);

  // --- Hook Realtime + polling ---
  useTransactionStatus(
    screen === 'waiting' ? transactionId : null,
    handleApproved,
    handleRefused
  );

  // --- Retour au formulaire ---
  const resetToLanding = () => {
    setScreen('landing');
    setSelectedForfait(null);
    setTransactionId(null);
    setVerify({ status: 'idle' });
  };

  // --- Changement d'onglet ---
  const switchTab = (next: Tab) => {
    setTab(next);
    setVerify({ status: 'idle' });
    setCodeLookup({ status: 'idle' });
  };

  return (
    <>
      <div className="page-wrapper">
        {/* ---- HEADER ---- */}
        <header className="header">
          <div className="header-logo">
            <div className="header-logo-icon">📶</div>
            <span className="header-logo-text">ZoneWifi</span>
            <div className="wifi-signal">
              <span /><span /><span />
            </div>
          </div>
          <p className="header-subtitle">
            Connexion rapide · Sécurisée · Via Wave
          </p>
        </header>

        {/* ---- CARTE PRINCIPALE ---- */}
        <main className="main-card" role="main">

          {/* ==== ÉCRAN 1 : Choix du parcours ==== */}
          {screen === 'landing' && (
            <>
              {/* Onglets */}
              <div className="tabs" role="tablist" aria-label="Choix du parcours">
                <button
                  role="tab"
                  aria-selected={tab === 'buy'}
                  className={`tab${tab === 'buy' ? ' active' : ''}`}
                  onClick={() => switchTab('buy')}
                >
                  <span className="tab-icon">💳</span>
                  Acheter un pass
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'connect'}
                  className={`tab${tab === 'connect' ? ' active' : ''}`}
                  onClick={() => switchTab('connect')}
                >
                  <span className="tab-icon">🔑</span>
                  J&apos;ai déjà un code
                </button>
                <button
                  role="tab"
                  aria-selected={tab === 'codes'}
                  className={`tab${tab === 'codes' ? ' active' : ''}`}
                  onClick={() => switchTab('codes')}
                >
                  <span className="tab-icon">📱</span>
                  Mes codes
                </button>
              </div>

              {/* ---- Onglet : Acheter un pass ---- */}
              {tab === 'buy' && (
                <div className="tab-panel">
                  <p className="section-label">Votre numéro Wave</p>
                  <PhoneField
                    id="phone-input"
                    value={phone}
                    error={phoneError}
                    onChange={handlePhoneChange}
                    onBlur={() => phone && validatePhone(phone)}
                  />

                  <p className="section-label">Choisissez votre pass</p>
                  <div className="forfaits-grid" role="list">
                    {FORFAITS.map((f) => (
                      <button
                        key={f.profil}
                        id={`pay-${f.profil}`}
                        role="listitem"
                        className={`pay-btn${selectedForfait?.profil === f.profil ? ' selected' : ''}`}
                        style={{ '--pay-accent': f.accent } as CSSProperties}
                        disabled={!phone || !!phoneError}
                        onClick={() => handleForfaitClick(f)}
                      >
                        <span className="pay-emoji">{f.emoji}</span>
                        <span className="pay-info">
                          <span className="pay-name">{f.label}</span>
                          <span className="pay-duration">{f.duree}</span>
                        </span>
                        <span className="pay-price">
                          {f.prix.toLocaleString('fr-FR')}{' '}
                          <span className="pay-currency">FCFA</span>
                        </span>
                        <span className="pay-btn-cta">Payer</span>
                      </button>
                    ))}
                  </div>

                  {/* Bouton "J'ai payé" — visible seulement après sélection */}
                  {selectedForfait && (
                    <div style={{ animation: 'pop-in 0.3s ease' }}>
                      <p style={{
                        textAlign: 'center',
                        fontSize: 13,
                        color: 'var(--color-text-muted)',
                        marginBottom: 12,
                        lineHeight: 1.6,
                      }}>
                        Après avoir payé <strong style={{ color: 'var(--color-text)' }}>
                          {selectedForfait.prix.toLocaleString('fr-FR')} FCFA
                        </strong> sur Wave, cliquez ci-dessous.
                      </p>
                      <button
                        id="btn-payment-done"
                        className="btn-paid visible"
                        onClick={handlePaymentDeclared}
                        disabled={isSubmitting}
                        aria-busy={isSubmitting}
                      >
                        {isSubmitting ? 'Envoi en cours...' : '✅ J\'ai effectué le paiement'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ---- Onglet : J'ai déjà un code ---- */}
              {tab === 'connect' && (
                <div className="tab-panel">
                  <p className="section-label">Votre code Wi-Fi</p>
                  <div className="code-input-wrapper">
                    <span className="code-input-icon">🔑</span>
                    <input
                      id="code-input"
                      type="text"
                      className="code-input"
                      placeholder="WIFI-XXXX"
                      value={code}
                      maxLength={24}
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label="Code Wi-Fi"
                      aria-invalid={verify.status === 'error' || verify.status === 'expired'}
                      onChange={(e) => {
                        setCode(e.target.value.toUpperCase());
                        setVerify({ status: 'idle' });
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleCodeConnect()}
                    />
                  </div>

                  <button
                    id="btn-code-connect"
                    className="btn-connect"
                    onClick={handleCodeConnect}
                    disabled={verify.status === 'checking'}
                    aria-busy={verify.status === 'checking'}
                  >
                    {verify.status === 'checking'
                      ? 'Vérification en cours…'
                      : '📶 Se connecter'}
                  </button>

                  {/* Statut de vérification */}
                  {verify.status === 'checking' && (
                    <div className="verify-status is-info" role="status">
                      <span className="verify-spinner" />
                      Vérification de votre code…
                    </div>
                  )}

                  {verify.status === 'ok' && (
                    <div className="verify-status is-ok" role="status">
                      ✅ Code valide — connexion en cours…
                    </div>
                  )}

                  {verify.status === 'expired' && (
                    <div className="verify-status is-error" role="alert">
                      ❌ {verify.message}
                      <button className="btn-retry" onClick={() => switchTab('buy')}>
                        Acheter un pass →
                      </button>
                    </div>
                  )}

                  {verify.status === 'error' && (
                    <div className="verify-status is-error" role="alert">
                      ⚠️ {verify.message}
                    </div>
                  )}

                  <p className="tab-hint">
                    Déjà client ? Entrez le code reçu lors de votre achat
                    pour vous reconnecter automatiquement.
                  </p>
                </div>
              )}

              {/* ---- Onglet : Mes codes ---- */}
              {tab === 'codes' && (
                <div className="tab-panel">
                  <p className="section-label">Retrouver votre code</p>
                  <PhoneField
                    id="code-phone-input"
                    value={phone}
                    error={phoneError}
                    onChange={handlePhoneChange}
                    onBlur={() => phone && validatePhone(phone)}
                  />
                  <p className="tab-hint" style={{ marginTop: 0, marginBottom: 14 }}>
                    Entrez le numéro utilisé lors de votre achat pour retrouver
                    votre code Wi-Fi attribué après validation du paiement.
                  </p>

                  <button
                    id="btn-find-code"
                    className="btn-lookup"
                    onClick={handleFindCode}
                    disabled={codeLookup.status === 'loading'}
                    aria-busy={codeLookup.status === 'loading'}
                  >
                    {codeLookup.status === 'loading'
                      ? 'Recherche en cours…'
                      : '🔍 Voir mon code'}
                  </button>

                  {codeLookup.status === 'found' && (
                    <div className="lookup-result is-found">
                      <p className="lookup-title">Votre dernier code</p>
                      <div className="lookup-code-box">
                        <span className="lookup-code">{codeLookup.code}</span>
                      </div>
                      {codeLookup.label && (
                        <p className="lookup-meta">
                          {codeLookup.label}
                          {codeLookup.montant
                            ? ` · ${codeLookup.montant.toLocaleString('fr-FR')} FCFA`
                            : ''}
                        </p>
                      )}
                      <button
                        className="btn-connect"
                        onClick={connectWithFoundCode}
                      >
                        📶 Se connecter avec ce code
                      </button>
                    </div>
                  )}

                  {codeLookup.status === 'none' && (
                    <div className="lookup-result is-none">
                      <p>
                        Aucun code trouvé pour ce numéro. Vérifiez votre numéro,
                        ou attendez que l&apos;admin confirme votre paiement.
                      </p>
                      <button className="btn-retry" onClick={() => switchTab('buy')}>
                        Acheter un pass →
                      </button>
                    </div>
                  )}

                  {codeLookup.status === 'error' && (
                    <div className="lookup-result is-error">
                      <p>⚠️ {codeLookup.message}</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ==== ÉCRAN 2 : Attente validation ==== */}
          {screen === 'waiting' && (
            <div id="status-panel" className="status-panel visible">
              <div className="spinner" role="status" aria-label="Chargement" />
              <p className="status-title">Vérification en cours</p>
              <p className="status-desc">
                Votre paiement est en cours de vérification par notre équipe.
                Votre code vous sera envoyé ici dès validation, et vous serez
                connecté automatiquement.
                <span className="status-dots">
                  <span /><span /><span />
                </span>
              </p>
              <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginTop: 20 }}>
                ⏱ Délai habituel : 1 à 5 minutes
              </p>
              <button
                style={{ marginTop: 20 }}
                className="btn-retry"
                onClick={resetToLanding}
              >
                ← Retour
              </button>
            </div>
          )}

          {/* ==== ÉCRAN 3 : Succès + auto-connexion ==== */}
          {screen === 'success' && (
            <div id="success-panel" className="success-panel visible">
              <div className="success-icon">✅</div>
              <p className="success-title">Paiement validé !</p>
              <p className="success-desc">
                Votre code Wi-Fi a été attribué. Connexion automatique en cours…
              </p>
              <div className="success-code-box">
                <p className="success-code-label">Code Wi-Fi</p>
                <p className="success-code-value" id="wifi-code-display">
                  {wifiCode}
                </p>
              </div>
              <p className="connecting-msg">
                📶 Connexion au réseau en cours…
              </p>
              <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginTop: 12 }}>
                Notez ce code, vous en aurez besoin si la connexion automatique échoue.
              </p>
            </div>
          )}

          {/* ==== ÉCRAN 4 : Refus ==== */}
          {screen === 'refused' && (
            <div id="error-panel" className="error-panel visible">
              <div className="error-icon">❌</div>
              <p className="error-title">Paiement refusé</p>
              <p className="error-desc">
                Votre paiement n&apos;a pas pu être vérifié. Veuillez contacter
                notre support ou réessayer.
              </p>
              <button
                id="btn-retry"
                className="btn-retry"
                onClick={resetToLanding}
              >
                ← Réessayer
              </button>
            </div>
          )}

          {/* ==== ÉCRAN 5 : Erreur réseau ==== */}
          {screen === 'error' && (
            <div className="error-panel visible">
              <div className="error-icon">⚠️</div>
              <p className="error-title">Erreur réseau</p>
              <p className="error-desc">
                Impossible de contacter le serveur. Vérifiez votre connexion.
              </p>
              <button
                className="btn-retry"
                onClick={resetToLanding}
              >
                ← Retour
              </button>
            </div>
          )}

          {/* ---- Pied de carte sécurité ---- */}
          <div className="footer-info">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Connexion sécurisée · Données protégées
          </div>
        </main>

        {/* ---- Contact WhatsApp ---- */}
        <a
          href="https://wa.me/2250100372900"
          target="_blank"
          rel="noopener noreferrer"
          className="whats-contact"
        >
          <span className="whats-icon">💬</span>
          Besoin d'aide ? Contactez le <span className="whats-number">0100372900</span>
        </a>
      </div>

      {/* ============================================================
          Formulaire caché — Auto-connexion MikroTik (HTTP PAP)
          L'URL action est injectée dynamiquement par le routeur
          ============================================================ */}
      <form
        id="mikrotik-form"
        className="mikrotik-form"
        method="POST"
        action={mkParams['link-login-only'] ?? 'http://192.168.88.1/login'}
      >
        <input type="hidden" name="username" defaultValue="" />
        <input type="hidden" name="password" defaultValue="" />
        <input type="hidden" name="dst" defaultValue={mkParams.dst ?? ''} />
        <input type="hidden" name="popup" defaultValue="true" />
      </form>

      {/* Toast global */}
      <Toast message={toast.message} visible={toast.visible} />
    </>
  );
}

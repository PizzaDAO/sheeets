'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, ExternalLink, Loader2, BadgeCheck, Clock } from 'lucide-react';
import type { ETHDenverEvent } from '@/lib/types';
import type { PublicClaim } from '@/lib/host-claims';
import { getValidLumaSlug, isLumaUrl } from '@/lib/luma';
import { isSafeHttpUrl } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { hostApi } from '@/hooks/useEventClaim';
import { AuthModal } from './AuthModal';

interface ClaimEventModalProps {
  event: ETHDenverEvent;
  claim: PublicClaim | null;
  onClaimChange: (claim: PublicClaim | null) => void;
  onClose: () => void;
}

const btnPrimary =
  'w-full px-4 py-2.5 bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-hover)] disabled:opacity-50 text-[var(--theme-accent-text)] rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center justify-center gap-2';
const btnSecondary =
  'w-full px-4 py-2 border border-[var(--theme-border-primary)] text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] disabled:opacity-50 rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center justify-center gap-2';
const linkBtn =
  'text-xs text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] underline underline-offset-2 cursor-pointer';
const textareaClass =
  'w-full bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg text-sm text-[var(--theme-text-primary)] px-3 py-2 focus:outline-none focus:border-[var(--theme-accent)] placeholder:text-[var(--theme-text-muted)]';

const REVIEW_PROMISE = 'Our team reviews claims within 48 hours.';

/**
 * Claim flow for event hosts: Luma code verification (description or host
 * bio), with manual admin review as fallback. Rendered in a portal so it works
 * from inside map popups (which use CSS transforms).
 */
export function ClaimEventModal({ event, claim, onClaimChange, onClose }: ClaimEventModalProps) {
  const { user } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [busy, setBusy] = useState<null | 'create' | 'verify' | 'manual' | 'withdraw'>(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [verifiedInfo, setVerifiedInfo] = useState<{ hostWide: boolean; hostName: string | null } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLuma = !!getValidLumaSlug(event.link);
  const lumaUrl = claim?.luma_url ?? (isLumaUrl(event.link) ? event.link : null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showAuth) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, showAuth]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  function startCooldown(seconds: number) {
    if (timerRef.current) clearInterval(timerRef.current);
    setCooldown(seconds);
    timerRef.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function createClaim(manual: boolean) {
    setBusy(manual ? 'manual' : 'create');
    setError('');
    const r = await hostApi<{ claim?: PublicClaim }>('/api/host/claims', {
      method: 'POST',
      body: { eventId: event.id, manual, ...(manual ? { note: note.trim() } : {}) },
    });
    setBusy(null);
    if (r.ok && r.data.claim) {
      onClaimChange(r.data.claim);
      setShowManual(false);
    } else {
      setError(r.data.error || 'Something went wrong. Try again.');
    }
  }

  async function verify() {
    if (!claim) return;
    setBusy('verify');
    setError('');
    setNotFound(false);
    const r = await hostApi<{
      result?: 'verified' | 'not_found';
      claim?: PublicClaim;
      host_wide?: boolean;
      host_name?: string | null;
    }>(`/api/host/claims/${claim.id}/verify`, { method: 'POST' });
    setBusy(null);
    if (r.data.claim) onClaimChange(r.data.claim);
    if (r.ok && r.data.result === 'verified') {
      setVerifiedInfo({ hostWide: !!r.data.host_wide, hostName: r.data.host_name ?? null });
      return;
    }
    if (r.ok && r.data.result === 'not_found') {
      setNotFound(true);
      startCooldown(10);
      return;
    }
    if (r.data.retry_after) startCooldown(r.data.retry_after);
    setError(r.data.error || 'Something went wrong. Try again.');
  }

  async function requestManual() {
    if (!claim) return createClaim(true);
    setBusy('manual');
    setError('');
    const r = await hostApi<{ claim?: PublicClaim }>(`/api/host/claims/${claim.id}/manual`, {
      method: 'POST',
      body: { note: note.trim() },
    });
    setBusy(null);
    if (r.ok && r.data.claim) {
      onClaimChange(r.data.claim);
      setShowManual(false);
    } else {
      setError(r.data.error || 'Something went wrong. Try again.');
    }
  }

  async function withdraw() {
    if (!claim) return;
    const msg =
      claim.status === 'verified'
        ? 'Remove your verified claim on this event? If it verified your Luma host profile, events verified through it are removed too.'
        : 'Withdraw your claim on this event?';
    if (!window.confirm(msg)) return;
    setBusy('withdraw');
    setError('');
    const r = await hostApi(`/api/host/claims/${claim.id}`, { method: 'DELETE' });
    setBusy(null);
    if (r.ok) {
      onClaimChange(null);
      setVerifiedInfo(null);
      setNotFound(false);
    } else {
      setError(r.data.error || 'Something went wrong. Try again.');
    }
  }

  async function copyCode() {
    if (!claim?.verification_code) return;
    try {
      await navigator.clipboard.writeText(claim.verification_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — code is selectable */
    }
  }

  const manualForm = (submitLabel: string, onSubmit: () => void) => (
    <div className="space-y-2">
      <label className="block text-xs text-[var(--theme-text-secondary)]">
        How are you involved? Include your role, a contact, and any proof (e.g. a link to your org or post about the event).
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 1000))}
        rows={3}
        maxLength={1000}
        className={textareaClass}
        placeholder="I'm the event lead at …"
      />
      <button
        onClick={onSubmit}
        disabled={busy !== null || note.trim().length === 0}
        className={btnPrimary}
      >
        {busy === 'manual' && <Loader2 className="w-4 h-4 animate-spin" />}
        {submitLabel}
      </button>
      <p className="text-[11px] text-[var(--theme-text-muted)]">{REVIEW_PROMISE}</p>
    </div>
  );

  let body: React.ReactNode;
  if (!user) {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-[var(--theme-text-secondary)]">
          Hosting this event? Claim it to get analytics on how people discover it on plan.wtf. Sign in to continue.
        </p>
        <button onClick={() => setShowAuth(true)} className={btnPrimary}>Sign in to claim</button>
      </div>
    );
  } else if (claim?.status === 'verified') {
    const hostWide = verifiedInfo?.hostWide || claim.matched_in === 'host_bio';
    body = (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-lg bg-green-500/10 border border-green-500/30 px-3 py-2.5">
          <BadgeCheck className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
          <div className="text-sm text-[var(--theme-text-primary)]">
            <p className="font-medium">Verified — dashboard coming soon</p>
            <p className="text-xs text-[var(--theme-text-secondary)] mt-1">
              {claim.matched_in === 'verified_host'
                ? 'Verified automatically through your verified Luma host profile.'
                : claim.matched_in === 'admin_review'
                  ? 'Approved by the plan.wtf team.'
                  : 'You can remove the code from Luma now.'}
            </p>
            {hostWide && (
              <p className="text-xs text-[var(--theme-text-secondary)] mt-1">
                Your Luma host profile{verifiedInfo?.hostName ? ` (${verifiedInfo.hostName})` : ''} is verified: other Luma events you host will verify automatically when you claim them.
              </p>
            )}
          </div>
        </div>
        <button onClick={withdraw} disabled={busy !== null} className={linkBtn}>
          {busy === 'withdraw' ? 'Removing…' : 'Not your event? Remove claim'}
        </button>
      </div>
    );
  } else if (claim?.status === 'pending') {
    const underReview = claim.method === 'manual';
    body = (
      <div className="space-y-3">
        {underReview && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2.5">
            <Clock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--theme-text-primary)]">
              Under review. {REVIEW_PROMISE}
              {claim.verification_code ? ' You can still verify instantly with Luma below.' : ''}
            </p>
          </div>
        )}
        {claim.verification_code && (
          <>
            <ol className="text-sm text-[var(--theme-text-secondary)] space-y-1.5 list-decimal pl-4">
              <li>Copy your code:</li>
            </ol>
            <div className="flex items-center gap-2">
              <code className="flex-1 select-all font-mono text-base tracking-wide text-[var(--theme-text-primary)] bg-[var(--theme-bg-tertiary)] rounded-lg px-3 py-2 text-center">
                {claim.verification_code}
              </code>
              <button onClick={copyCode} className="p-2 rounded-lg border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] cursor-pointer" aria-label="Copy code">
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <ol start={2} className="text-sm text-[var(--theme-text-secondary)] space-y-1.5 list-decimal pl-4">
              <li>
                Paste it anywhere in your <strong className="text-[var(--theme-text-primary)]">Luma event description</strong>, or in your <strong className="text-[var(--theme-text-primary)]">Luma profile bio</strong> if you&apos;re a listed host. Save.
              </li>
              <li>Click Verify. You can remove the code afterwards.</li>
            </ol>
            <p className="text-[11px] text-[var(--theme-text-muted)]">
              Using your profile bio also verifies you for other Luma events you host.
            </p>
            {lumaUrl && isSafeHttpUrl(lumaUrl) && (
              <a href={lumaUrl} target="_blank" rel="noopener noreferrer" className={btnSecondary}>
                Open Luma event <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button onClick={verify} disabled={busy !== null || cooldown > 0 || claim.attempts_left <= 0} className={btnPrimary}>
              {busy === 'verify' && <Loader2 className="w-4 h-4 animate-spin" />}
              {cooldown > 0 ? `Verify (${cooldown}s)` : 'Verify'}
            </button>
            {notFound && (
              <p className="text-xs text-[var(--theme-text-secondary)]">
                We couldn&apos;t find <span className="font-mono">{claim.verification_code}</span> on the Luma event yet. Make sure you saved the description (or your bio, if you&apos;re listed as a host), then try again.
                {claim.attempts_left <= 5 && ` ${claim.attempts_left} attempts left.`}
              </p>
            )}
          </>
        )}
        {!underReview && (
          showManual
            ? manualForm('Request manual review', requestManual)
            : (
              <button onClick={() => setShowManual(true)} className={linkBtn}>
                Can&apos;t edit the Luma page? Request manual review
              </button>
            )
        )}
        <div>
          <button onClick={withdraw} disabled={busy !== null} className={linkBtn}>
            {busy === 'withdraw' ? 'Withdrawing…' : 'Withdraw claim'}
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-[var(--theme-text-secondary)]">
          Claim this event to see how people discover it on plan.wtf (views, link clicks, stars and more — aggregate and anonymized).
        </p>
        {isLuma && !showManual ? (
          <>
            <p className="text-sm text-[var(--theme-text-secondary)]">
              We&apos;ll give you a short code to paste into the Luma event description (or your Luma host bio) to prove it&apos;s yours.
            </p>
            <button onClick={() => createClaim(false)} disabled={busy !== null} className={btnPrimary}>
              {busy === 'create' && <Loader2 className="w-4 h-4 animate-spin" />}
              Get verification code
            </button>
            <button onClick={() => setShowManual(true)} className={linkBtn}>
              Can&apos;t edit the Luma page? Request manual review
            </button>
          </>
        ) : (
          manualForm('Request review', () => createClaim(true))
        )}
      </div>
    );
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70] bg-black/60" onClick={onClose} />
      <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="claim-event-title"
          className="pointer-events-auto relative bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between px-4 py-3 border-b border-[var(--theme-border-primary)]">
            <div className="min-w-0">
              <h2 id="claim-event-title" className="text-base font-bold text-[var(--theme-text-primary)]">
                Claim this event
              </h2>
              <p className="text-xs text-[var(--theme-text-secondary)] truncate">
                {event.name} · {event.conference}
              </p>
            </div>
            <button onClick={onClose} className="p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] cursor-pointer shrink-0 ml-2" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4">
            {body}
            {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
          </div>
        </div>
      </div>
      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>,
    document.body
  );
}

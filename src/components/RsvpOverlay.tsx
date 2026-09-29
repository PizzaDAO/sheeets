'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, User, Mail, Send, Building2, Briefcase, Linkedin, ExternalLink } from 'lucide-react';
import { isSafeHttpUrl } from '@/lib/utils';

interface RsvpOverlayProps {
  eventName: string;
  lumaUrl: string;
  userName?: string | null;
  userEmail?: string | null;
  userXHandle?: string | null;
  userTelegram?: string | null;
  userCompany?: string | null;
  userLinkedin?: string | null;
  userJobTitle?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

function getLumaSlug(url: string): string | null {
  try {
    const u = new URL(url);
    const h = u.hostname;
    if (h !== 'lu.ma' && h !== 'luma.com' && h !== 'www.luma.com') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[0] || null;
  } catch {
    return null;
  }
}

function CopyField({ icon, value }: { icon: React.ReactNode; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: do nothing if clipboard API unavailable
    }
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 min-w-0 flex-1 rounded-md px-1.5 py-1 hover:bg-[var(--theme-bg-secondary)] transition-colors cursor-pointer text-left"
      aria-label={`Copy ${value}`}
    >
      <span className="shrink-0 text-[var(--theme-text-muted)]">
        {icon}
      </span>
      <span className="block text-xs text-[var(--theme-text-primary)] truncate min-w-0 flex-1">
        {value}
      </span>
      <span className="shrink-0">
        {copied ? (
          <Check className="w-3.5 h-3.5 text-green-400" />
        ) : (
          <Copy className="w-3.5 h-3.5 text-[var(--theme-text-secondary)]" />
        )}
      </span>
    </button>
  );
}

export function RsvpOverlay({
  eventName,
  lumaUrl,
  userName,
  userEmail,
  userXHandle,
  userTelegram,
  userCompany,
  userLinkedin,
  userJobTitle,
  onConfirm,
  onClose,
}: RsvpOverlayProps) {
  const slug = getLumaSlug(lumaUrl);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (!slug) return null;

  const hasCopyFields = userName || userEmail || userXHandle || userTelegram || userCompany || userLinkedin || userJobTitle;
  const embedUrl = `https://lu.ma/embed/event/${slug}/simple`;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      {/* Dark backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal container: bottom-sheet on mobile, centered on desktop */}
      <div
        className="relative w-full sm:max-w-lg bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-t-2xl sm:rounded-xl shadow-2xl flex flex-col"
        style={{ height: '85vh', maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Use a CSS media query workaround via Tailwind for desktop height */}
        <style>{`
          @media (min-width: 640px) {
            .rsvp-overlay-panel {
              height: 80vh !important;
              max-height: 80vh !important;
            }
          }
        `}</style>
        <div className="rsvp-overlay-panel flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border-primary)] shrink-0">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-[var(--theme-text-primary)] truncate">
                RSVP
              </h2>
              <a
                href={isSafeHttpUrl(lumaUrl) ? lumaUrl : undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[var(--theme-text-secondary)] hover:underline truncate max-w-full"
              >
                <span className="truncate">{eventName}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer shrink-0 ml-2"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Sticky copy-fields bar */}
          {hasCopyFields && (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-2.5 border-b border-[var(--theme-border-primary)] bg-[var(--theme-bg-tertiary)] shrink-0">
              {userName && <CopyField icon={<User className="w-3.5 h-3.5" />} value={userName} />}
              {userEmail && <CopyField icon={<Mail className="w-3.5 h-3.5" />} value={userEmail} />}
              {userXHandle && <CopyField icon={<span className="text-xs font-bold leading-none" style={{ fontSize: '13px' }}>𝕏</span>} value={`@${userXHandle}`} />}
              {userTelegram && <CopyField icon={<Send className="w-3.5 h-3.5" />} value={`@${userTelegram}`} />}
              {userCompany && <CopyField icon={<Building2 className="w-3.5 h-3.5" />} value={userCompany} />}
              {userJobTitle && <CopyField icon={<Briefcase className="w-3.5 h-3.5" />} value={userJobTitle} />}
              {userLinkedin && <CopyField icon={<Linkedin className="w-3.5 h-3.5" />} value={userLinkedin} />}
            </div>
          )}

          {/* Luma iframe -- fills remaining space */}
          <div className="flex-1 min-h-0">
            <iframe
              src={embedUrl}
              className="w-full h-full border-0"
              allow="payment"
              title={`RSVP for ${eventName}`}
            />
          </div>

          {/* Bottom action buttons */}
          <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--theme-border-primary)] bg-[var(--theme-bg-secondary)] shrink-0">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] text-sm font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Done — I RSVP'd
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

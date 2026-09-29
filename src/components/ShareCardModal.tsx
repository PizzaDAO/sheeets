'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Copy, Check, Loader2 } from 'lucide-react';
import type { ETHDenverEvent } from '@/lib/types';
import { formatDateLabel } from '@/lib/utils';
import { sortByStartTime } from '@/lib/time-parse';
import { trackShareCardOpen, trackShareCardCopy, trackShareCardDownload } from '@/lib/analytics';
import ShareCardTemplate from './ShareCardTemplate';

interface ShareCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: ETHDenverEvent[];
  conferenceName: string;
  displayName: string | null;
  avatarUrl?: string | null;
  hiddenEventIds?: Set<string>;
}

export function ShareCardModal({
  isOpen,
  onClose,
  events,
  conferenceName,
  displayName,
  avatarUrl,
  hiddenEventIds,
}: ShareCardModalProps) {
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [showPastEvents, setShowPastEvents] = useState(false);
  const defaultTitle = displayName ? `${displayName}'s ${conferenceName} Plan` : `My ${conferenceName} Plan`;
  const [cardTitle, setCardTitle] = useState(defaultTitle);
  const [hasUserEdited, setHasUserEdited] = useState(false);

  // Update card title when displayName loads (profile is async)
  useEffect(() => {
    if (!hasUserEdited) {
      setCardTitle(defaultTitle);
    }
  }, [defaultTitle, hasUserEdited]);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied'>('idle');
  const cardRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackedRef = useRef(false);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const pastEventIds = useMemo(
    () => new Set(events.filter((e) => e.dateISO && e.dateISO !== 'unknown' && e.dateISO < today).map((e) => e.id)),
    [events, today]
  );

  const visibleEvents = useMemo(
    () => showPastEvents ? events : events.filter((e) => !pastEventIds.has(e.id)),
    [events, showPastEvents, pastEventIds]
  );

  const selectedEvents = useMemo(
    () => visibleEvents.filter((e) => !excludedIds.has(e.id)),
    [visibleEvents, excludedIds]
  );

  // Group events by date for the toggle list
  const dateGroups = useMemo(() => {
    const groupMap = new Map<string, ETHDenverEvent[]>();
    for (const event of visibleEvents) {
      const key = event.dateISO || 'unknown';
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(event);
    }
    return Array.from(groupMap.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([dateISO, groupEvents]) => ({
        dateISO,
        label: dateISO === 'unknown' ? 'Date TBD' : formatDateLabel(dateISO),
        events: groupEvents.sort(sortByStartTime),
      }));
  }, [visibleEvents]);

  const toggleEvent = useCallback((eventId: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);

  // Generate preview image
  const generatePreview = useCallback(async () => {
    if (!cardRef.current || selectedEvents.length === 0) {
      setPreviewUrl(null);
      return;
    }
    setGenerating(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: '#0c0a09',
        style: { position: 'static', left: '0' },
      });
      setPreviewUrl(dataUrl);
    } catch (err) {
      console.error('Preview generation failed:', err);
    } finally {
      setGenerating(false);
    }
  }, [selectedEvents.length]);

  // Debounced preview regeneration when selection changes
  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      generatePreview();
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isOpen, selectedEvents, cardTitle, generatePreview]);

  // Track open event
  useEffect(() => {
    if (isOpen && !trackedRef.current) {
      trackShareCardOpen();
      trackedRef.current = true;
    }
    if (!isOpen) {
      trackedRef.current = false;
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setExcludedIds(new Set(hiddenEventIds ?? []));
      setShowPastEvents(false);
      setCardTitle(displayName ? `${displayName}'s ${conferenceName} Plan` : `My ${conferenceName} Plan`);
      setPreviewUrl(null);
      setCopyStatus('idle');
    }
  }, [isOpen, hiddenEventIds]);

  const handleCopy = useCallback(async () => {
    if (!cardRef.current || selectedEvents.length === 0) return;
    setCopyStatus('copying');
    try {
      const { toBlob } = await import('html-to-image');
      const blob = await toBlob(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: '#0c0a09',
        style: { position: 'static', left: '0' },
      });
      if (!blob) {
        setCopyStatus('idle');
        return;
      }
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      trackShareCardCopy();
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (err) {
      console.error('Copy to clipboard failed:', err);
      setCopyStatus('idle');
    }
  }, [selectedEvents.length]);

  const handleDownload = useCallback(async () => {
    if (!cardRef.current || selectedEvents.length === 0) return;
    try {
      const { toBlob } = await import('html-to-image');
      const blob = await toBlob(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: '#0c0a09',
        style: { position: 'static', left: '0' },
      });
      if (!blob) return;
      trackShareCardDownload();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `itinerary-${(cardTitle || conferenceName).toLowerCase().replace(/\s+/g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  }, [selectedEvents.length, conferenceName]);

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border-primary)] shrink-0">
            <h2 className="text-base font-bold text-[var(--theme-text-primary)]">Share My Plan</h2>
            <button
              onClick={onClose}
              className="p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
            {/* Editable title */}
            <div>
              <label className="text-xs font-medium text-[var(--theme-text-secondary)] uppercase tracking-wide mb-1 block">
                Card Title
              </label>
              <input
                type="text"
                value={cardTitle}
                onChange={(e) => { setCardTitle(e.target.value); setHasUserEdited(true); }}
                className="w-full px-3 py-2 bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg text-[var(--theme-text-primary)] text-sm focus:outline-none focus:border-[var(--theme-accent)] transition-colors"
                placeholder={defaultTitle}
              />
            </div>

            {/* Preview area */}
            <div className="rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] overflow-hidden">
              {generating && !previewUrl ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-[var(--theme-text-secondary)] animate-spin" />
                </div>
              ) : previewUrl ? (
                <div className="relative">
                  {generating && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--theme-bg-primary)]/60 z-10">
                      <Loader2 className="w-5 h-5 text-[var(--theme-text-secondary)] animate-spin" />
                    </div>
                  )}
                  <img
                    src={previewUrl}
                    alt="Itinerary share card preview"
                    className="w-full h-auto block"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center py-12 text-[var(--theme-text-muted)] text-sm">
                  Select at least one event to generate preview
                </div>
              )}
            </div>

            {/* Event toggle list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-[var(--theme-text-secondary)] uppercase tracking-wide">
                  Events to include ({selectedEvents.length} of {visibleEvents.length})
                </p>
                {pastEventIds.size > 0 && (
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showPastEvents}
                      onChange={(e) => setShowPastEvents(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] accent-[var(--theme-accent)] cursor-pointer"
                    />
                    <span className="text-[11px] text-[var(--theme-text-muted)]">
                      Show past ({pastEventIds.size})
                    </span>
                  </label>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] divide-y divide-[var(--theme-border-secondary)]">
                {dateGroups.map((group) => (
                  <div key={group.dateISO}>
                    <div className="px-3 py-1.5 bg-[var(--theme-bg-secondary)]/50 sticky top-0">
                      <span className="text-[10px] font-bold text-[var(--theme-text-muted)] uppercase tracking-wider">
                        {group.label}
                      </span>
                    </div>
                    {group.events.map((event) => {
                      const isIncluded = !excludedIds.has(event.id);
                      const timeDisplay = event.isAllDay
                        ? 'All Day'
                        : event.startTime || '';

                      return (
                        <label
                          key={event.id}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--theme-bg-tertiary)]/50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isIncluded}
                            onChange={() => toggleEvent(event.id)}
                            className="w-4 h-4 rounded border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] text-[var(--theme-accent)] focus:ring-[var(--theme-accent)] focus:ring-offset-0 cursor-pointer accent-[var(--theme-accent)]"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {timeDisplay && (
                                <span className="text-[11px] text-[var(--theme-text-muted)] shrink-0">
                                  {timeDisplay}
                                </span>
                              )}
                              <span className={`text-sm truncate ${isIncluded ? 'text-[var(--theme-text-primary)]' : 'text-[var(--theme-text-muted)]'}`}>
                                {event.name}
                              </span>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="px-4 py-3 border-t border-[var(--theme-border-primary)] flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopy}
              disabled={selectedEvents.length === 0 || copyStatus === 'copying'}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                copyStatus === 'copied'
                  ? 'bg-green-600 text-white'
                  : 'bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-hover)] text-[var(--theme-accent-text)]'
              }`}
            >
              {copyStatus === 'copying' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Copying...
                </>
              ) : copyStatus === 'copied' ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy to Clipboard
                </>
              )}
            </button>
            <button
              onClick={handleDownload}
              disabled={selectedEvents.length === 0}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-card-hover)] text-[var(--theme-text-primary)] rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Download PNG
            </button>
          </div>
        </div>
      </div>

      {/* Offscreen card template for image generation */}
      <ShareCardTemplate
        ref={cardRef}
        events={selectedEvents}
        conferenceName={cardTitle || conferenceName}
        displayName={displayName}
        avatarUrl={avatarUrl}
      />
    </>,
    document.body
  );
}

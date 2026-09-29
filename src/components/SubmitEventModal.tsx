'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Check, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { VIBE_COLORS, TYPE_TAGS, SHEET_ID, getTabConfig } from '@/lib/constants';
import type { TabConfig } from '@/lib/conferences';
import { trackSubmitEventOpen, trackSubmitEventSuccess, trackSubmitEventFetch, trackSubmitEventTagToggle, trackModalDismiss } from '@/lib/analytics';
import type { UpsellCopy } from '@/lib/types';
import { Dropdown, TIME_OPTIONS, format12Hour } from './DateTimePicker';
import { AddressAutocomplete } from './AddressAutocomplete';
import { isSafeHttpUrl } from '@/lib/utils';

interface SubmitEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  upsellCopy?: UpsellCopy;
  initialConference?: string;
  conferenceTabs?: TabConfig[];
}

type Step = 'input' | 'form' | 'success';

const EVENT_URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDateShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

// Tags for the selector: TYPE_TAGS excluding synthetic tags + topic tags from VIBE_COLORS
const EXCLUDED_TAGS = ['$$', '\u{1F355} Food', 'Food', 'Drinks'];
const FORMAT_TAGS = TYPE_TAGS.filter((t) => !EXCLUDED_TAGS.includes(t));
const TOPIC_TAGS = Object.keys(VIBE_COLORS).filter(
  (t) => !TYPE_TAGS.includes(t) && t !== 'default' && !EXCLUDED_TAGS.includes(t)
);
const ALL_TAGS = [...FORMAT_TAGS, ...TOPIC_TAGS];

export function SubmitEventModal({ isOpen, onClose, upsellCopy, initialConference, conferenceTabs = [] }: SubmitEventModalProps) {
  const [step, setStep] = useState<Step>('input');
  const [lumaUrl, setLumaUrl] = useState('');
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Form fields — date as ISO "2026-03-10", times as 24h "19:00"
  const [conference, setConference] = useState(initialConference || conferenceTabs[0]?.name || '');
  const [name, setName] = useState('');
  const [dateISO, setDateISO] = useState('');
  const [startTime24, setStartTime24] = useState('');
  const [endTime24, setEndTime24] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [address, setAddress] = useState('');
  const [cost, setCost] = useState('Free');
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [hasFood, setHasFood] = useState(false);
  const [hasBar, setHasBar] = useState(false);
  const [addressCoords, setAddressCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Sync conference when modal opens
  useEffect(() => {
    if (isOpen) {
      trackSubmitEventOpen();
      if (initialConference) setConference(initialConference);
    }
  }, [isOpen, initialConference]);

  function resetForm() {
    setStep('input');
    setLumaUrl('');
    setFetchLoading(false);
    setFetchError('');
    setSubmitLoading(false);
    setSubmitError('');
    setConference(initialConference || conferenceTabs[0]?.name || '');
    setName('');
    setDateISO('');
    setStartTime24('');
    setEndTime24('');
    setOrganizer('');
    setAddress('');
    setCost('Free');
    setLink('');
    setNote('');
    setSelectedTags(new Set());
    setHasFood(false);
    setHasBar(false);
    setAddressCoords(null);
  }

  function handleClose() {
    trackModalDismiss('submit_event');
    resetForm();
    onClose();
  }

  // Fetch ref to prevent stale closure in auto-fetch debounce
  const fetchingRef = useRef(false);

  const handleFetchLuma = useCallback(async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed || fetchingRef.current) return;
    fetchingRef.current = true;
    setFetchLoading(true);
    setFetchError('');

    try {
      const res = await fetch('/api/fetch-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        trackSubmitEventFetch(false);
        setFetchError(data.error || 'Failed to fetch event details.');
        setFetchLoading(false);
        fetchingRef.current = false;
        return;
      }

      // Pre-fill form with ISO/24h values from API
      trackSubmitEventFetch(true);
      setName(data.name || '');
      setDateISO(data.dateISO || '');
      setStartTime24(data.startTime24 || '');
      setEndTime24(data.endTime24 || '');
      setOrganizer(data.organizer || '');
      setAddress(data.address || '');
      setCost(data.cost || 'Free');
      setLink(data.link || trimmed);
      setStep('form');
    } catch {
      trackSubmitEventFetch(false);
      setFetchError('Failed to fetch event details. Please try again.');
    }

    setFetchLoading(false);
    fetchingRef.current = false;
  }, []);

  // Auto-fetch when a valid event URL is pasted/typed
  useEffect(() => {
    if (step !== 'input' || !EVENT_URL_RE.test(lumaUrl.trim())) return;
    const timer = setTimeout(() => handleFetchLuma(lumaUrl), 300);
    return () => clearTimeout(timer);
  }, [lumaUrl, step, handleFetchLuma]);

  function handleEnterManually() {
    const tab = getTabConfig(conference, conferenceTabs);
    if (!dateISO && tab.dates.length > 0) setDateISO(tab.dates[0]);
    setLink(lumaUrl.trim());
    setStep('form');
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
        trackSubmitEventTagToggle(tag, false);
      } else {
        next.add(tag);
        trackSubmitEventTagToggle(tag, true);
      }
      return next;
    });
  }

  async function handleSubmit() {
    if (!name.trim() || !dateISO) {
      setSubmitError('Event name and date are required.');
      return;
    }

    setSubmitLoading(true);
    setSubmitError('');

    try {
      const tagsStr = Array.from(selectedTags).join(', ');

      const res = await fetch('/api/submit-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conference,
          coords: addressCoords,
          event: {
            name: name.trim(),
            date: dateISO ? formatDateShort(dateISO) : '',
            startTime: startTime24 ? format12Hour(startTime24) : '',
            endTime: endTime24 ? format12Hour(endTime24) : '',
            organizer: organizer.trim(),
            address: address.trim(),
            cost: cost.trim() || 'Free',
            tags: tagsStr,
            link: link.trim(),
            food: hasFood,
            bar: hasBar,
            note: note.trim(),
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || 'Failed to submit event.');
        setSubmitLoading(false);
        return;
      }

      trackSubmitEventSuccess(conference);
      setStep('success');
      setTimeout(() => handleClose(), 8000);
    } catch {
      setSubmitError('Failed to submit event. Please try again.');
    }

    setSubmitLoading(false);
  }

  if (!isOpen) return null;

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[100] bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div
          className="bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border-primary)] shrink-0">
            <h2 className="text-base font-bold text-[var(--theme-text-primary)]">
              {step === 'input' && 'Submit Event'}
              {step === 'form' && 'Event Details'}
              {step === 'success' && 'Submitted!'}
            </h2>
            <button
              onClick={handleClose}
              className="p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="px-4 py-5 overflow-y-auto flex-1">
            {/* Step 1: Luma URL Input */}
            {step === 'input' && (
              <div className="space-y-4">
                <p className="text-[var(--theme-text-secondary)] text-sm">
                  Paste an event URL to auto-fill the details, or enter manually.
                </p>

                <div className="flex items-center gap-2 bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg px-3 py-2.5 focus-within:border-[var(--theme-accent)] transition-colors">
                  <LinkIcon className="w-4 h-4 text-[var(--theme-text-muted)] shrink-0" />
                  <input
                    type="url"
                    value={lumaUrl}
                    onChange={(e) => setLumaUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleFetchLuma(lumaUrl);
                      }
                    }}
                    placeholder="Paste any event URL"
                    className="flex-1 bg-transparent text-[var(--theme-text-primary)] text-sm outline-none placeholder:text-[var(--theme-text-muted)]"
                    autoFocus
                  />
                </div>

                {fetchError && <p className="text-red-400 text-xs">{fetchError}</p>}

                {fetchLoading ? (
                  <div className="flex items-center justify-center gap-2 py-2.5 text-[var(--theme-text-secondary)] text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Fetching event details...
                  </div>
                ) : (
                  <button
                    onClick={() => handleFetchLuma(lumaUrl)}
                    disabled={!lumaUrl.trim()}
                    className="w-full px-4 py-2.5 bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-hover)] disabled:opacity-50 text-[var(--theme-accent-text)] rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    Fetch Event
                  </button>
                )}

                <button
                  onClick={handleEnterManually}
                  className="w-full text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] text-xs text-center cursor-pointer"
                >
                  or enter details manually
                </button>
              </div>
            )}

            {/* Step 2: Editable Form */}
            {step === 'form' && (
              <div className="space-y-4">
                {/* Conference selector */}
                <div>
                  <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">Conference</label>
                  <select
                    value={conference}
                    onChange={(e) => setConference(e.target.value)}
                    className="w-full bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg text-[var(--theme-text-primary)] text-sm px-3 py-2 focus:border-[var(--theme-accent)] focus:outline-none"
                  >
                    {conferenceTabs.map((t) => (
                      <option key={t.gid} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Event name */}
                <div>
                  <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">
                    Event Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Builders Night"
                    className="w-full bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg text-[var(--theme-text-primary)] text-sm px-3 py-2 focus:border-[var(--theme-accent)] focus:outline-none placeholder:text-[var(--theme-text-muted)]"
                  />
                </div>

                {/* Date + Times row */}
                <div className="flex items-end gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">
                      Date <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="date"
                      value={dateISO}
                      onChange={(e) => setDateISO(e.target.value)}
                      className="bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg text-[var(--theme-text-primary)] text-sm px-3 py-1.5 focus:border-[var(--theme-accent)] focus:outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:invert"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">Start</label>
                    <Dropdown
                      value={startTime24 || ''}
                      options={['', ...TIME_OPTIONS]}
                      renderOption={(v) => v ? format12Hour(v) : '\u2014'}
                      renderSelected={(v) => v ? format12Hour(v) : 'Start'}
                      onChange={setStartTime24}
                      width="110px"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">End</label>
                    <Dropdown
                      value={endTime24 || ''}
                      options={['', ...TIME_OPTIONS]}
                      renderOption={(v) => v ? format12Hour(v) : '\u2014'}
                      renderSelected={(v) => v ? format12Hour(v) : 'End'}
                      onChange={setEndTime24}
                      width="110px"
                    />
                  </div>
                </div>

                {/* Organizer */}
                <div>
                  <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">Organizer</label>
                  <input
                    type="text"
                    value={organizer}
                    onChange={(e) => setOrganizer(e.target.value)}
                    placeholder="DeFi Alliance"
                    className="w-full bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg text-[var(--theme-text-primary)] text-sm px-3 py-2 focus:border-[var(--theme-accent)] focus:outline-none placeholder:text-[var(--theme-text-muted)]"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">Address</label>
                  <AddressAutocomplete value={address} onChange={setAddress} onCoordsChange={setAddressCoords} />
                </div>

                {/* Cost */}
                <div>
                  <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">Cost</label>
                  <input
                    type="text"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="Free"
                    className="w-full bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg text-[var(--theme-text-primary)] text-sm px-3 py-2 focus:border-[var(--theme-accent)] focus:outline-none placeholder:text-[var(--theme-text-muted)]"
                  />
                </div>

                {/* Link */}
                <div>
                  <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">Link</label>
                  <input
                    type="url"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="Paste any event URL"
                    className="w-full bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg text-[var(--theme-text-primary)] text-sm px-3 py-2 focus:border-[var(--theme-accent)] focus:outline-none placeholder:text-[var(--theme-text-muted)]"
                  />
                </div>

                {/* Food / Drinks toggles */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setHasFood(!hasFood)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                      hasFood
                        ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-text)]'
                        : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-card-hover)]'
                    }`}
                  >
                    <span className="text-xs">{hasFood ? '\u2713' : '+'}</span>
                    Food
                  </button>
                  <button
                    type="button"
                    onClick={() => setHasBar(!hasBar)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                      hasBar
                        ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-text)]'
                        : 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] hover:bg-[var(--theme-bg-card-hover)]'
                    }`}
                  >
                    <span className="text-xs">{hasBar ? '\u2713' : '+'}</span>
                    Drinks
                  </button>
                </div>

                {/* Type */}
                <div>
                  <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1.5">Type</label>
                  <div className="flex flex-wrap gap-1.5">
                    {FORMAT_TAGS.map((tag) => {
                      const isSelected = selectedTags.has(tag);
                      const color = VIBE_COLORS[tag] || VIBE_COLORS.default;
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className="px-2 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border"
                          style={
                            isSelected
                              ? { backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, borderColor: color, color }
                              : { backgroundColor: 'transparent', borderColor: 'var(--theme-border-primary)', color: 'var(--theme-text-secondary)' }
                          }
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1.5">Tags</label>
                  <div className="flex flex-wrap gap-1.5">
                    {TOPIC_TAGS.map((tag) => {
                      const isSelected = selectedTags.has(tag);
                      const color = VIBE_COLORS[tag] || VIBE_COLORS.default;
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className="px-2 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border"
                          style={
                            isSelected
                              ? { backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, borderColor: color, color }
                              : { backgroundColor: 'transparent', borderColor: 'var(--theme-border-primary)', color: 'var(--theme-text-secondary)' }
                          }
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label className="block text-xs font-medium text-[var(--theme-text-secondary)] mb-1">Note</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Any additional details..."
                    rows={2}
                    className="w-full bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)] rounded-lg text-[var(--theme-text-primary)] text-sm px-3 py-2 focus:border-[var(--theme-accent)] focus:outline-none placeholder:text-[var(--theme-text-muted)] resize-none"
                  />
                </div>

                {submitError && <p className="text-red-400 text-xs">{submitError}</p>}

                <button
                  onClick={handleSubmit}
                  disabled={submitLoading || !name.trim() || !dateISO}
                  className="w-full px-4 py-2.5 bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-hover)] disabled:opacity-50 text-[var(--theme-accent-text)] rounded-lg text-sm font-medium transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  {submitLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Submit Event'
                  )}
                </button>

                <button
                  onClick={() => setStep('input')}
                  className="w-full text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] text-xs text-center cursor-pointer"
                >
                  Back
                </button>
              </div>
            )}

            {/* Step 3: Success */}
            {step === 'success' && (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-green-600/20 flex items-center justify-center mx-auto mb-3">
                  <Check className="w-6 h-6 text-green-400" />
                </div>
                <p className="text-[var(--theme-text-primary)] font-medium">Event submitted!</p>
                <p className="text-[var(--theme-text-secondary)] text-sm mt-1">
                  Your submission is pending review and will appear once approved.
                </p>

                {upsellCopy && (
                  <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-[var(--theme-accent-muted)] to-[var(--theme-accent-muted)] border border-[var(--theme-accent)]/30 text-left">
                    <h4 className="text-sm font-semibold text-[var(--theme-accent-link)] mb-1">{upsellCopy.heading}</h4>
                    <p className="text-xs text-[var(--theme-text-secondary)] mb-3">{upsellCopy.body}</p>
                    <a href={isSafeHttpUrl(upsellCopy.cta_url) ? upsellCopy.cta_url : undefined} target="_blank" rel="noopener noreferrer"
                       className="inline-block px-4 py-2 text-xs font-semibold bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-hover)] text-[var(--theme-accent-text)] rounded-lg transition-colors">
                      {upsellCopy.cta_text}
                    </a>
                  </div>
                )}

                <button
                  onClick={handleClose}
                  className="mt-4 px-4 py-2 text-sm text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          {step !== 'success' && (
            <div className="px-4 py-3 border-t border-[var(--theme-border-primary)] shrink-0">
              <a
                href={sheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-xs text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                or edit spreadsheet directly
              </a>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

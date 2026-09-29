'use client';

import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, CheckCircle, Clock, Loader2, AlertTriangle,
  ChevronDown, ChevronRight, Mail, User, Building2,
  Briefcase, Phone, Globe, Send, Linkedin,
} from 'lucide-react';
import { useBatchRsvp, type BatchProfileData } from '@/hooks/useBatchRsvp';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/contexts/AuthContext';
import { isLumaUrl } from '@/lib/luma';
import type { ETHDenverEvent } from '@/lib/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BatchRsvpModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: ETHDenverEvent[];
  itinerary: Set<string>;
  confirmedIds: Set<string>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BatchRsvpModal({
  isOpen,
  onClose,
  events,
  itinerary,
  confirmedIds,
}: BatchRsvpModalProps) {
  const {
    step,
    selectedEventIds,
    scannedEvents,
    scanning,
    profileData,
    customAnswers,
    jobStatuses,
    selectEvent,
    selectAll,
    deselectAll,
    setProfileField,
    setAnswer,
    scanSelectedEvents,
    nextStep,
    prevStep,
    submit,
    reset,
    stopPolling,
  } = useBatchRsvp();

  const { profile, updateProfile } = useProfile();
  const { user: authUser } = useAuth();

  // Luma events in itinerary that aren't already RSVP'd
  const eligibleEvents = events.filter(
    (e) => itinerary.has(e.id) && isLumaUrl(e.link) && !confirmedIds.has(e.id)
  );

  const handleClose = useCallback(() => {
    stopPolling();
    reset();
    onClose();
  }, [stopPolling, reset, onClose]);

  // Pre-fill profile data from existing profile
  useEffect(() => {
    if (profile && isOpen) {
      setProfileField('email', authUser?.email || profile.email || '');
      setProfileField('firstName', profile.first_name || '');
      setProfileField('lastName', profile.last_name || '');
      setProfileField('company', profile.company || '');
      setProfileField('jobTitle', profile.job_title || '');
      setProfileField('phone', profile.phone || '');
      setProfileField('telegram', profile.telegram_handle || '');
      setProfileField('xHandle', profile.x_handle || '');
      setProfileField('linkedin', profile.linkedin_url || '');
      setProfileField('website', profile.website || '');
    }
  }, [profile, authUser, isOpen, setProfileField]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Lock body scroll + cleanup polling on unmount
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      stopPolling();
    };
  }, [isOpen, stopPolling]);

  // Trigger scan when moving from select -> profile
  const handleNextFromSelect = useCallback(async () => {
    await scanSelectedEvents(eligibleEvents);
    nextStep();
  }, [scanSelectedEvents, eligibleEvents, nextStep]);

  // Save profile field on blur
  const handleProfileBlur = useCallback(
    (field: keyof BatchProfileData) => {
      const fieldMap: Partial<Record<keyof BatchProfileData, string>> = {
        firstName: 'first_name',
        lastName: 'last_name',
        company: 'company',
        jobTitle: 'job_title',
        phone: 'phone',
        telegram: 'telegram_handle',
        xHandle: 'x_handle',
        linkedin: 'linkedin_url',
        website: 'website',
      };

      const dbField = fieldMap[field];
      if (dbField && profileData[field]) {
        updateProfile({ [dbField]: profileData[field] } as Record<string, string>);
      }
    },
    [profileData, updateProfile]
  );

  if (!isOpen) return null;

  const stepTitles: Record<string, string> = {
    select: 'Select Events',
    profile: 'Your Info',
    custom: 'Just a few more details',
    review: 'Review & Submit',
    submitting: 'Submitting...',
    results: 'Results',
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center"
      onClick={handleClose}
    >
      <div className="absolute inset-0 bg-black/60" />

      <div
        className="relative w-full sm:max-w-lg bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-t-2xl sm:rounded-xl shadow-2xl flex flex-col"
        style={{ height: '85vh', maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border-primary)] shrink-0">
          <div>
            <h2 className="text-sm font-bold text-[var(--theme-text-primary)]">
              Batch RSVP
            </h2>
            <p className="text-xs text-[var(--theme-text-secondary)]">
              {stepTitles[step] || ''}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {step === 'select' && (
            <SelectStep
              events={eligibleEvents}
              selectedIds={selectedEventIds}
              onSelect={selectEvent}
              onSelectAll={() => selectAll(eligibleEvents.map((e) => e.id))}
              onDeselectAll={deselectAll}
            />
          )}
          {step === 'profile' && (
            <ProfileStep
              data={profileData}
              onChange={setProfileField}
              onBlur={handleProfileBlur}
              scanning={scanning}
            />
          )}
          {step === 'custom' && (
            <CustomFieldsStep
              selectedEventIds={selectedEventIds}
              scannedEvents={scannedEvents}
              customAnswers={customAnswers}
              onSetAnswer={setAnswer}
            />
          )}
          {(step === 'review' || step === 'submitting') && (
            <ReviewStep
              selectedEventIds={selectedEventIds}
              scannedEvents={scannedEvents}
              profileData={profileData}
              submitting={step === 'submitting'}
            />
          )}
          {step === 'results' && (
            <ResultsStep
              jobStatuses={jobStatuses}
            />
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[var(--theme-border-primary)] bg-[var(--theme-bg-secondary)] shrink-0">
          {step === 'select' && (
            <>
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] text-sm font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleNextFromSelect}
                disabled={selectedEventIds.size === 0}
                className="flex-1 px-4 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                Next ({selectedEventIds.size} selected)
              </button>
            </>
          )}
          {(step === 'profile' || step === 'custom') && (
            <>
              <button
                onClick={prevStep}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] text-sm font-medium transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={nextStep}
                disabled={step === 'profile' && (!profileData.email || !profileData.firstName || !profileData.lastName)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                Next
              </button>
            </>
          )}
          {step === 'review' && (
            <>
              <button
                onClick={prevStep}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] hover:bg-[var(--theme-bg-tertiary)] text-sm font-medium transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                onClick={submit}
                className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                Submit RSVPs
              </button>
            </>
          )}
          {step === 'submitting' && (
            <div className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm text-[var(--theme-text-secondary)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Creating RSVP jobs...
            </div>
          )}
          {step === 'results' && (
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-2.5 rounded-lg bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-hover)] text-[var(--theme-accent-text)] text-sm font-semibold transition-colors cursor-pointer"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Step 1: Select Events
// ---------------------------------------------------------------------------

function SelectStep({
  events,
  selectedIds,
  onSelect,
  onSelectAll,
  onDeselectAll,
}: {
  events: ETHDenverEvent[];
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-[var(--theme-text-secondary)] text-sm">
          No Luma events in your itinerary that need RSVPs.
        </p>
        <p className="text-[var(--theme-text-muted)] text-xs mt-1">
          Add some Luma events to your itinerary first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--theme-text-muted)]">
          {selectedIds.size} of {events.length} selected
        </span>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="text-xs text-orange-400 hover:text-orange-300 transition-colors cursor-pointer"
          >
            Select all
          </button>
          <span className="text-xs text-[var(--theme-text-muted)]">|</span>
          <button
            onClick={onDeselectAll}
            className="text-xs text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] transition-colors cursor-pointer"
          >
            Deselect all
          </button>
        </div>
      </div>

      {events.map((event) => (
        <label
          key={event.id}
          className="flex items-start gap-3 p-3 rounded-lg border border-[var(--theme-border-primary)] hover:bg-[var(--theme-bg-tertiary)] transition-colors cursor-pointer"
        >
          <input
            type="checkbox"
            checked={selectedIds.has(event.id)}
            onChange={() => onSelect(event.id)}
            className="mt-0.5 accent-orange-500"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--theme-text-primary)] truncate">
              {event.name}
            </p>
            <p className="text-xs text-[var(--theme-text-secondary)]">
              {event.date} {event.startTime && `- ${event.startTime}`}
            </p>
            <p className="text-xs text-[var(--theme-text-muted)] truncate">
              {event.organizer}
            </p>
          </div>
        </label>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Profile Info
// ---------------------------------------------------------------------------

function ProfileStep({
  data,
  onChange,
  onBlur,
  scanning,
}: {
  data: BatchProfileData;
  onChange: (field: keyof BatchProfileData, value: string) => void;
  onBlur: (field: keyof BatchProfileData) => void;
  scanning: boolean;
}) {
  const fields: { key: keyof BatchProfileData; label: string; icon: React.ReactNode; required?: boolean; type?: string }[] = [
    { key: 'email', label: 'Email', icon: <Mail className="w-4 h-4" />, required: true, type: 'email' },
    { key: 'firstName', label: 'First Name', icon: <User className="w-4 h-4" />, required: true },
    { key: 'lastName', label: 'Last Name', icon: <User className="w-4 h-4" />, required: true },
    { key: 'company', label: 'Company', icon: <Building2 className="w-4 h-4" /> },
    { key: 'jobTitle', label: 'Job Title', icon: <Briefcase className="w-4 h-4" /> },
    { key: 'telegram', label: 'Telegram', icon: <Send className="w-4 h-4" /> },
    { key: 'xHandle', label: 'X Handle', icon: <span className="text-xs font-bold leading-none w-4 text-center">X</span> },
    { key: 'linkedin', label: 'LinkedIn', icon: <Linkedin className="w-4 h-4" /> },
    { key: 'phone', label: 'Phone', icon: <Phone className="w-4 h-4" />, type: 'tel' },
    { key: 'website', label: 'Website', icon: <Globe className="w-4 h-4" />, type: 'url' },
  ];

  return (
    <div className="space-y-3">
      {scanning && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          <span className="text-xs text-blue-300">Scanning event registration forms...</span>
        </div>
      )}

      <p className="text-xs text-[var(--theme-text-muted)]">
        Saved for future events
      </p>

      {fields.map(({ key, label, icon, required, type }) => (
        <div key={key} className="flex items-center gap-2">
          <span className="text-[var(--theme-text-muted)] shrink-0">{icon}</span>
          <input
            type={type || 'text'}
            value={data[key]}
            onChange={(e) => onChange(key, e.target.value)}
            onBlur={() => onBlur(key)}
            // RSVPs are only submitted for the signed-in account's (verified) email
            readOnly={key === 'email'}
            title={key === 'email' ? 'RSVPs use your signed-in email' : undefined}
            placeholder={`${label}${required ? ' *' : ''}`}
            className="flex-1 bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-primary)] rounded-lg px-3 py-2 text-sm text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-muted)] focus:outline-none focus:border-orange-500/50"
          />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Custom Fields
// ---------------------------------------------------------------------------

function CustomFieldsStep({
  selectedEventIds,
  scannedEvents,
  customAnswers,
  onSetAnswer,
}: {
  selectedEventIds: Set<string>;
  scannedEvents: Map<string, { event: ETHDenverEvent; formResult: { questions: { id: string; label: string; question_type: string; is_required: boolean; options?: string[]; terms_content?: string }[] } | null }>;
  customAnswers: Map<string, Map<string, string>>;
  onSetAnswer: (eventId: string, questionId: string, answer: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = useCallback((eventId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }, []);

  const eventsWithQuestions = Array.from(selectedEventIds)
    .map((id) => scannedEvents.get(id))
    .filter((s): s is NonNullable<typeof s> => !!s?.formResult?.questions?.length);

  if (eventsWithQuestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CheckCircle className="w-8 h-8 text-green-400 mb-3" />
        <p className="text-[var(--theme-text-secondary)] text-sm">
          No custom fields needed!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {eventsWithQuestions.map((scanned) => {
        const isCollapsed = collapsed.has(scanned.event.id);
        const eventAnswers = customAnswers.get(scanned.event.id);

        return (
          <div
            key={scanned.event.id}
            className="border border-[var(--theme-border-primary)] rounded-lg overflow-hidden"
          >
            <button
              onClick={() => toggleCollapse(scanned.event.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-[var(--theme-bg-tertiary)] text-left cursor-pointer hover:bg-[var(--theme-bg-tertiary)]/80 transition-colors"
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4 text-[var(--theme-text-muted)] shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[var(--theme-text-muted)] shrink-0" />
              )}
              <span className="text-sm font-medium text-[var(--theme-text-primary)] truncate">
                {scanned.event.name}
              </span>
              <span className="text-xs text-[var(--theme-text-muted)] shrink-0 ml-auto">
                {scanned.formResult!.questions.length} field(s)
              </span>
            </button>

            {!isCollapsed && (
              <div className="p-3 space-y-3">
                {scanned.formResult!.questions.map((q) => (
                  <CustomFieldInput
                    key={q.id}
                    question={q}
                    value={eventAnswers?.get(q.id) || ''}
                    onChange={(val) => onSetAnswer(scanned.event.id, q.id, val)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CustomFieldInput({
  question,
  value,
  onChange,
}: {
  question: { id: string; label: string; question_type: string; is_required: boolean; options?: string[]; terms_content?: string };
  value: string;
  onChange: (val: string) => void;
}) {
  const label = `${question.label}${question.is_required ? ' *' : ''}`;

  if (question.question_type === 'dropdown' && question.options) {
    return (
      <div>
        <label className="block text-xs text-[var(--theme-text-secondary)] mb-1">{label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-primary)] rounded-lg px-3 py-2 text-sm text-[var(--theme-text-primary)] focus:outline-none focus:border-orange-500/50"
        >
          <option value="">Select...</option>
          {question.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  if (question.question_type === 'multi-select' && question.options) {
    const selected = new Set(value ? value.split(',') : []);
    return (
      <div>
        <label className="block text-xs text-[var(--theme-text-secondary)] mb-1">{label}</label>
        <div className="space-y-1">
          {question.options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-[var(--theme-text-primary)] cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(opt)}
                onChange={() => {
                  const next = new Set(selected);
                  if (next.has(opt)) next.delete(opt);
                  else next.add(opt);
                  onChange(Array.from(next).join(','));
                }}
                className="accent-orange-500"
              />
              {opt}
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (question.question_type === 'terms') {
    return (
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(e.target.checked ? 'true' : '')}
          className="mt-0.5 accent-orange-500"
        />
        <span className="text-xs text-[var(--theme-text-secondary)]">
          {question.terms_content || question.label}
        </span>
      </label>
    );
  }

  // Default: text input
  return (
    <div>
      <label className="block text-xs text-[var(--theme-text-secondary)] mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.label}
        className="w-full bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-primary)] rounded-lg px-3 py-2 text-sm text-[var(--theme-text-primary)] placeholder:text-[var(--theme-text-muted)] focus:outline-none focus:border-orange-500/50"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: Review & Submit
// ---------------------------------------------------------------------------

function ReviewStep({
  selectedEventIds,
  scannedEvents,
  profileData,
  submitting,
}: {
  selectedEventIds: Set<string>;
  scannedEvents: Map<string, { event: ETHDenverEvent; formResult: { eventApiId: string } | null }>;
  profileData: BatchProfileData;
  submitting: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Profile summary */}
      <div className="p-3 rounded-lg bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-primary)]">
        <p className="text-xs font-medium text-[var(--theme-text-secondary)] mb-2">Submitting as:</p>
        <p className="text-sm text-[var(--theme-text-primary)]">
          {profileData.firstName} {profileData.lastName}
        </p>
        <p className="text-xs text-[var(--theme-text-muted)]">{profileData.email}</p>
        {profileData.company && (
          <p className="text-xs text-[var(--theme-text-muted)]">{profileData.company}</p>
        )}
      </div>

      {/* Event list */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-[var(--theme-text-secondary)]">
          {selectedEventIds.size} event(s):
        </p>
        {Array.from(selectedEventIds).map((eventId) => {
          const scanned = scannedEvents.get(eventId);
          if (!scanned) return null;
          return (
            <div
              key={eventId}
              className="flex items-center gap-2 p-2 rounded-lg border border-[var(--theme-border-primary)]"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
              ) : (
                <Clock className="w-4 h-4 text-[var(--theme-text-muted)] shrink-0" />
              )}
              <span className="text-sm text-[var(--theme-text-primary)] truncate">
                {scanned.event.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5: Results
// ---------------------------------------------------------------------------

function ResultsStep({ jobStatuses }: { jobStatuses: { id: number; eventId: string; eventName: string; status: string; errorMessage?: string }[] }) {
  const statusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-400 shrink-0" />;
      case 'submitting':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />;
      case 'failed':
        return <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />;
      default:
        return <Clock className="w-4 h-4 text-[var(--theme-text-muted)] shrink-0" />;
    }
  };

  const successCount = jobStatuses.filter((j) => j.status === 'success').length;
  const failedCount = jobStatuses.filter((j) => j.status === 'failed').length;
  const pendingCount = jobStatuses.filter((j) => j.status === 'pending' || j.status === 'submitting').length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--theme-bg-tertiary)] border border-[var(--theme-border-primary)]">
        {pendingCount > 0 ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            <span className="text-sm text-[var(--theme-text-primary)]">
              Processing... {successCount} done, {pendingCount} remaining
            </span>
          </>
        ) : failedCount > 0 ? (
          <>
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
            <span className="text-sm text-[var(--theme-text-primary)]">
              {successCount} succeeded, {failedCount} failed
            </span>
          </>
        ) : (
          <>
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-sm text-[var(--theme-text-primary)]">
              All {successCount} RSVPs submitted!
            </span>
          </>
        )}
      </div>

      {/* Job list */}
      <div className="space-y-2">
        {jobStatuses.map((job) => (
          <div
            key={job.id}
            className="flex items-start gap-2 p-2 rounded-lg border border-[var(--theme-border-primary)]"
          >
            {statusIcon(job.status)}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[var(--theme-text-primary)] truncate">
                {job.eventName}
              </p>
              {job.errorMessage && (
                <p className="text-xs text-red-400 mt-0.5">{job.errorMessage}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {pendingCount > 0 && (
        <p className="text-xs text-[var(--theme-text-muted)] text-center">
          Jobs are processed by a background worker. You can close this and check back later.
        </p>
      )}
    </div>
  );
}

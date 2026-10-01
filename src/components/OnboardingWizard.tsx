'use client';

import { useState, useEffect, useMemo } from 'react';
import { useIsClient } from '@/hooks/useIsClient';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { X, CirclePlus, Clock, Users, Map, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { VIBE_COLORS, TYPE_TAGS } from '@/lib/constants';
import type { TabConfig } from '@/lib/conferences';
import type { ETHDenverEvent } from '@/lib/types';
import { TAG_ICONS } from './TagBadge';
import {
  trackOnboardingStart,
  trackOnboardingStep,
  trackOnboardingComplete,
  trackOnboardingSkip,
} from '@/lib/analytics';

interface OnboardingWizardProps {
  isOpen: boolean;
  onComplete: (config: { conference: string; selectedTags: string[] }) => void;
  onDismiss: () => void;
  availableConferences: string[];
  conferenceEventCounts?: Record<string, number>;
  events: ETHDenverEvent[];
  onOpenAuth: () => void;
  conferenceTabs?: TabConfig[];
}

type StepId = 'welcome' | 'conference' | 'interests' | 'tips' | 'signin';

const STEPS: StepId[] = ['welcome', 'conference', 'interests', 'tips', 'signin'];

// Topic tags only (exclude TYPE_TAGS and 'default')
const TOPIC_TAGS = Object.keys(VIBE_COLORS).filter(
  (t) => !TYPE_TAGS.includes(t) && t !== 'default'
);

const TIPS = [
  {
    icon: CirclePlus,
    title: 'Build Your Plan',
    description: 'Tap + on any event to add it to your plan.',
  },
  {
    icon: Clock,
    title: 'Now Mode',
    description: 'See what\'s happening right now or starting within the hour.',
  },
  {
    icon: Users,
    title: 'Find Friends',
    description: 'Add friends to see which events they plan to attend.',
  },
  {
    icon: Map,
    title: 'Map, List, and Table Views',
    description: 'Switch between map, list, and table views to find events your way.',
  },
  {
    icon: Plus,
    title: 'Add Your Event',
    description: 'Know about a side event? Tap the + button to submit it to the schedule.',
  },
];

export function OnboardingWizard({
  isOpen,
  onComplete,
  onDismiss,
  availableConferences,
  conferenceEventCounts = {},
  events,
  onOpenAuth,
  conferenceTabs = [],
}: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedConference, setSelectedConference] = useState(conferenceTabs[0]?.name || availableConferences[0] || '');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const mounted = useIsClient();

  useEffect(() => {
    if (isOpen) {
      trackOnboardingStart();
    }
  }, [isOpen]);

  // Events for selected conference
  const conferenceEvents = useMemo(
    () => events.filter((e) => e.conference === selectedConference),
    [events, selectedConference]
  );

  // Tags that exist in the selected conference's events (topic tags only)
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const e of conferenceEvents) {
      for (const t of e.tags) {
        if (!TYPE_TAGS.includes(t) && t !== 'default' && VIBE_COLORS[t]) {
          tagSet.add(t);
        }
      }
    }
    return TOPIC_TAGS.filter((t) => tagSet.has(t));
  }, [conferenceEvents]);

  // Count of events matching selected tags (or all if none selected)
  const matchingEventCount = useMemo(() => {
    if (selectedTags.size === 0) return conferenceEvents.length;
    const tagsArr = Array.from(selectedTags);
    return conferenceEvents.filter((e) =>
      tagsArr.some((t) => e.tags.includes(t))
    ).length;
  }, [conferenceEvents, selectedTags]);

  if (!isOpen || !mounted) return null;

  const stepId = STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === STEPS.length - 1;

  function handleNext() {
    if (isLastStep) {
      trackOnboardingComplete(selectedConference, selectedTags.size);
      onComplete({ conference: selectedConference, selectedTags: Array.from(selectedTags) });
      return;
    }
    const nextStep = currentStep + 1;
    setCurrentStep(nextStep);
    trackOnboardingStep(STEPS[nextStep]);
  }

  function handleBack() {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
    }
  }

  function handleSkip() {
    trackOnboardingSkip(stepId);
    onDismiss();
  }

  function handleClose() {
    trackOnboardingSkip(stepId);
    onDismiss();
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }

  function handleSignIn() {
    trackOnboardingComplete(selectedConference, selectedTags.size);
    onComplete({ conference: selectedConference, selectedTags: Array.from(selectedTags) });
    // Open auth modal after completing onboarding
    setTimeout(() => onOpenAuth(), 100);
  }

  // Get conference date range display
  function getConferenceDates(confName: string): string {
    const tab = conferenceTabs.find((t) => t.name === confName);
    if (!tab || tab.dates.length === 0) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const first = tab.dates[0];
    const last = tab.dates[tab.dates.length - 1];
    const [, m1, d1] = first.split('-').map(Number);
    const [, m2, d2] = last.split('-').map(Number);
    if (m1 === m2) {
      return `${months[m1 - 1]} ${d1} - ${d2}`;
    }
    return `${months[m1 - 1]} ${d1} - ${months[m2 - 1]} ${d2}`;
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[100] bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={handleClose}>
        <div
          className="bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--theme-border-primary)] shrink-0">
            <div className="w-8" /> {/* Spacer for centering */}
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === currentStep ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-text-faint)]'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={handleClose}
              className="p-1 text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="px-4 py-5 overflow-y-auto flex-1">
            {/* Step 1: Welcome */}
            {stepId === 'welcome' && (
              <div className="flex flex-col items-center text-center space-y-5 py-4">
                <Image
                  src="/logo.png"
                  alt="sheeets"
                  width={160}
                  height={44}
                  style={{ filter: 'var(--theme-logo-filter)' }}
                  priority
                />
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-[var(--theme-text-primary)]">
                    Your conference side-event guide
                  </h2>
                  <p className="text-[var(--theme-text-secondary)] text-sm max-w-xs mx-auto">
                    Find events, build your schedule, and coordinate with friends -- all in one place.
                  </p>
                </div>
                <button
                  onClick={handleNext}
                  className="w-full max-w-xs px-6 py-3 bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-hover)] text-[var(--theme-accent-text)] rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                >
                  Get Started
                </button>
                <button
                  onClick={handleSkip}
                  className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] text-xs transition-colors cursor-pointer"
                >
                  Skip intro
                </button>
              </div>
            )}

            {/* Step 2: Pick Conference */}
            {stepId === 'conference' && (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <h2 className="text-lg font-bold text-[var(--theme-text-primary)]">Which conference?</h2>
                  <p className="text-[var(--theme-text-secondary)] text-sm">
                    Pick your conference to see relevant events
                  </p>
                </div>
                <div className="space-y-2">
                  {conferenceTabs.filter(
                    (tab) => {
                      if (availableConferences.length > 0 && !availableConferences.includes(tab.name)) return false;
                      const today = new Date().toISOString().slice(0, 10);
                      return events.some((e) => e.conference === tab.name && e.dateISO >= today);
                    }
                  ).map((tab) => {
                    const isSelected = selectedConference === tab.name;
                    return (
                      <button
                        key={tab.gid}
                        onClick={() => setSelectedConference(tab.name)}
                        className={`w-full text-left p-4 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[var(--theme-accent-muted)] border-[var(--theme-accent)] ring-1 ring-[var(--theme-accent)]/50'
                            : 'bg-[var(--theme-bg-primary)] border-[var(--theme-border-primary)] hover:border-[var(--theme-border-primary)]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className={`font-semibold ${isSelected ? 'text-[var(--theme-accent-link)]' : 'text-[var(--theme-text-primary)]'}`}>
                            {tab.name}
                          </div>
                          {conferenceEventCounts[tab.name] != null && (
                            <div className={`text-xs ${isSelected ? 'text-[var(--theme-accent-link)]/70' : 'text-[var(--theme-text-muted)]'}`}>
                              {conferenceEventCounts[tab.name]} events
                            </div>
                          )}
                        </div>
                        <div className="text-[var(--theme-text-secondary)] text-xs mt-0.5">
                          {getConferenceDates(tab.name)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 3: Select Interests */}
            {stepId === 'interests' && (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <h2 className="text-lg font-bold text-[var(--theme-text-primary)]">What are you into?</h2>
                  <p className="text-[var(--theme-text-secondary)] text-sm">
                    Select tags to filter your feed
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {availableTags.map((tag) => {
                    const isSelected = selectedTags.has(tag);
                    const color = VIBE_COLORS[tag] || VIBE_COLORS.default;
                    const Icon = TAG_ICONS[tag];
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer border"
                        style={
                          isSelected
                            ? {
                                backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
                                borderColor: color,
                                color: color,
                              }
                            : {
                                backgroundColor: 'transparent',
                                borderColor: 'var(--theme-border-primary)',
                                color: 'var(--theme-text-secondary)',
                              }
                        }
                      >
                        {Icon && <Icon className="w-3.5 h-3.5" />}
                        {tag}
                      </button>
                    );
                  })}
                </div>
                <p className="text-center text-xs text-[var(--theme-text-muted)]">
                  {matchingEventCount} event{matchingEventCount !== 1 ? 's' : ''}{selectedTags.size > 0 ? ' match' : ''}
                </p>
              </div>
            )}

            {/* Step 4: Quick Tips */}
            {stepId === 'tips' && (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <h2 className="text-lg font-bold text-[var(--theme-text-primary)]">Quick tips</h2>
                  <p className="text-[var(--theme-text-secondary)] text-sm">
                    Get the most out of your experience
                  </p>
                </div>
                <div className="space-y-3">
                  {TIPS.map((tip) => {
                    const TipIcon = tip.icon;
                    return (
                      <div
                        key={tip.title}
                        className="flex items-start gap-3 p-3 rounded-lg bg-[var(--theme-bg-primary)] border border-[var(--theme-border-primary)]"
                      >
                        <div className="shrink-0 w-9 h-9 rounded-lg bg-[var(--theme-accent-muted)] flex items-center justify-center">
                          <TipIcon className="w-4.5 h-4.5 text-[var(--theme-accent-link)]" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[var(--theme-text-primary)]">{tip.title}</div>
                          <div className="text-xs text-[var(--theme-text-secondary)] mt-0.5">{tip.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 5: Optional Sign In */}
            {stepId === 'signin' && (
              <div className="flex flex-col items-center text-center space-y-5 py-4">
                <div className="w-14 h-14 rounded-full bg-[var(--theme-accent-muted)] flex items-center justify-center">
                  <Users className="w-7 h-7 text-[var(--theme-accent-link)]" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-bold text-[var(--theme-text-primary)]">
                    Sign in to unlock more
                  </h2>
                  <p className="text-[var(--theme-text-secondary)] text-sm max-w-xs mx-auto">
                    Save your itinerary across devices, add friends, and see who else is attending.
                  </p>
                </div>
                <button
                  onClick={handleSignIn}
                  className="w-full max-w-xs px-6 py-3 bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-hover)] text-[var(--theme-accent-text)] rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                >
                  Sign in with email
                </button>
                <button
                  onClick={() => {
                    trackOnboardingComplete(selectedConference, selectedTags.size);
                    onComplete({ conference: selectedConference, selectedTags: Array.from(selectedTags) });
                  }}
                  className="text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] text-xs transition-colors cursor-pointer"
                >
                  Maybe later
                </button>
              </div>
            )}
          </div>

          {/* Footer navigation — hidden on welcome step */}
          {stepId !== 'welcome' && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--theme-border-primary)] shrink-0">
              <button
                onClick={handleBack}
                disabled={isFirstStep}
                className="flex items-center gap-1 text-sm text-[var(--theme-text-secondary)] hover:text-[var(--theme-text-primary)] disabled:opacity-30 disabled:cursor-default transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>

              {stepId !== 'signin' && (
                <>
                  <button
                    onClick={handleSkip}
                    className="text-xs text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)] transition-colors cursor-pointer"
                  >
                    Skip
                  </button>

                  <button
                    onClick={handleNext}
                    className="flex items-center gap-1 px-4 py-2 bg-[var(--theme-accent)] hover:bg-[var(--theme-accent-hover)] text-[var(--theme-accent-text)] rounded-lg text-sm font-medium transition-colors cursor-pointer"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}
              {stepId === 'signin' && <div />}
            </div>
          )}

          {/* Step indicator dots at bottom */}
          <div className="flex justify-center gap-1.5 pb-3">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === currentStep ? 'bg-[var(--theme-accent)]' : 'bg-[var(--theme-text-faint)]'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

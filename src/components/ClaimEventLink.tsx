'use client';

import { useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import type { ETHDenverEvent } from '@/lib/types';
import { useEventClaim } from '@/hooks/useEventClaim';
import { ClaimEventModal } from './ClaimEventModal';

/**
 * Small "Host? Claim this event" link for event detail surfaces (table detail
 * modal, map popup). Shows the claim state once the user has one.
 */
export function ClaimEventLink({ event, className = '' }: { event: ETHDenverEvent; className?: string }) {
  const [open, setOpen] = useState(false);
  const { claim, setClaim } = useEventClaim(event.id);

  let label: React.ReactNode = 'Host? Claim this event';
  if (claim?.status === 'verified') {
    label = (
      <span className="inline-flex items-center gap-1">
        <BadgeCheck className="w-3.5 h-3.5 text-green-500" /> Verified host · dashboard coming soon
      </span>
    );
  } else if (claim?.status === 'pending') {
    label = claim.method === 'manual' ? 'Claim under review' : 'Finish verifying your claim';
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={`text-[11px] text-[var(--theme-text-muted)] hover:text-[var(--theme-text-primary)] underline-offset-2 hover:underline cursor-pointer transition-colors ${className}`}
      >
        {label}
      </button>
      {open && (
        <ClaimEventModal
          event={event}
          claim={claim}
          onClaimChange={setClaim}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

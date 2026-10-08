'use client';

import { useEffect } from 'react';
import { MapPinCheck, X } from 'lucide-react';

interface AutoCheckInToastProps {
  eventName: string;
  onUndo: () => void;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 10_000;

export function AutoCheckInToast({ eventName, onUndo, onDismiss }: AutoCheckInToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [eventName, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-32px)] max-w-sm flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg bg-green-600 text-white text-sm"
    >
      <MapPinCheck className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-0">
        You&apos;re at <span className="font-semibold">{eventName}</span> — checked in
      </span>
      <button
        onClick={onUndo}
        className="shrink-0 px-2 py-1 rounded font-semibold underline underline-offset-2 hover:bg-white/10 cursor-pointer"
      >
        Undo
      </button>
      <button onClick={onDismiss} aria-label="Dismiss" className="shrink-0 p-1 rounded hover:bg-white/10 cursor-pointer">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

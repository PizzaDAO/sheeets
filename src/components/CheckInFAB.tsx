'use client';

import { useEffect, useState } from 'react';
import { MapPinCheck, Loader2 } from 'lucide-react';

interface CheckInFABProps {
  liveItineraryCount: number;
  onCheckIn: () => void;
  loading: boolean;
  result: { ok: boolean; message: string } | null;
}

export function CheckInFAB({ liveItineraryCount, onCheckIn, loading, result }: CheckInFABProps) {
  // Each new result is shown for 3s; once its timer fires it is remembered as
  // expired so the toast hides without a synchronous setState in the effect.
  const [expiredResult, setExpiredResult] = useState<CheckInFABProps['result']>(null);
  const showResult = result !== null && result !== expiredResult;

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setExpiredResult(result), 3000);
    return () => clearTimeout(timer);
  }, [result]);

  if (liveItineraryCount <= 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Result toast */}
      {showResult && result && (
        <div
          className={`px-3 py-2 rounded-lg text-sm font-medium shadow-lg max-w-[280px] ${
            result.ok
              ? 'bg-green-600 text-white'
              : 'bg-[var(--theme-bg-secondary)] text-[var(--theme-text-secondary)] border border-[var(--theme-border-primary)]'
          }`}
        >
          {result.message}
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={onCheckIn}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-full shadow-lg transition-colors cursor-pointer"
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <MapPinCheck className="w-5 h-5" />
        )}
        <span className="font-medium text-sm">Check In</span>
        <span className="bg-green-500 text-white text-xs font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1">
          {liveItineraryCount}
        </span>
      </button>
    </div>
  );
}

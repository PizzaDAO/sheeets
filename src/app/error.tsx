'use client';

import { useEffect } from 'react';
import { trackError } from '@/lib/analytics';
import { reportClientError } from '@/lib/error-reporter';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    trackError(error.message, 'error-boundary');
    reportClientError(error, { kind: 'boundary', digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 bg-[var(--theme-bg-primary)]">
      <h2 className="text-lg font-semibold text-[var(--theme-text-primary)]">Something went wrong</h2>
      <p className="text-sm text-[var(--theme-text-muted)] text-center max-w-md">{error.message}</p>
      <button
        onClick={reset}
        className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--theme-accent)] text-white hover:opacity-90 transition-opacity"
      >
        Try again
      </button>
    </div>
  );
}

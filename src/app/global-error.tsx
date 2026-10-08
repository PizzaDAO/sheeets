'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/error-reporter';

/**
 * Last-resort boundary for errors thrown in the root layout. Replaces the
 * whole document, so it renders its own <html>/<body> and can't rely on
 * globals.css / theme variables.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, { kind: 'boundary', digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 16,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#fafaf9',
          color: '#1c1917',
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Something went wrong</h2>
        <button
          onClick={reset}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#2563eb',
            color: '#fff',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}

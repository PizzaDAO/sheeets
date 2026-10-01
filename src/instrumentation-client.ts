// Runs in the browser before the app becomes interactive (Next.js
// instrumentation-client convention). Installs global error capture that
// reports to /api/errors — see src/lib/error-reporter.ts.
import { installGlobalErrorHandlers } from '@/lib/error-reporter';

try {
  installGlobalErrorHandlers();
} catch {
  // Monitoring must never break the app
}

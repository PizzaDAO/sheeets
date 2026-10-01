import type { Instrumentation } from 'next';

/** How long we let the DB write run before giving up (best effort). */
const RECORD_TIMEOUT_MS = 1500;

/**
 * Server error hook: logs one compact structured line (visible in Vercel
 * logs, grep for `[server-error]`) and records the error in `app_errors`.
 * Best effort — never throws, and the DB write is time-boxed.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  try {
    const { describeError, stackHead, ERROR_FIELD_LIMITS } = await import('@/lib/error-monitoring');
    const { message, stack } = describeError(err);
    const digest =
      typeof err === 'object' && err !== null && 'digest' in err ? String((err as { digest: unknown }).digest) : undefined;

    // Next.js control-flow "errors" (redirect/notFound/etc.) aren't bugs
    if (digest?.startsWith('NEXT_')) return;

    console.error(
      '[server-error]',
      JSON.stringify({
        route: context.routePath,
        routeType: context.routeType,
        method: request.method,
        path: request.path.slice(0, ERROR_FIELD_LIMITS.url),
        digest,
        message: message.slice(0, ERROR_FIELD_LIMITS.message),
        stack: stackHead(stack, 4),
      })
    );

    // The DB client needs Node APIs; there is no edge proxy today, but be safe.
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;

    const { recordAppError } = await import('@/lib/error-store');
    const ua = request.headers['user-agent'];
    await Promise.race([
      recordAppError({
        source: 'server',
        // digest is logged above but kept out of the message so the
        // fingerprint stays stable across occurrences
        message,
        stack,
        url: request.path,
        route: `${request.method} ${context.routePath}`,
        userAgent: Array.isArray(ua) ? ua[0] : ua,
      }),
      new Promise((resolve) => setTimeout(resolve, RECORD_TIMEOUT_MS)),
    ]);
  } catch {
    // Never let monitoring throw
  }
};

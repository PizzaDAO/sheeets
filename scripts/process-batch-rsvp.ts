/**
 * Batch RSVP processor script
 *
 * Processes pending batch_rsvp_jobs by:
 *   1. Loading the Luma embed page via Playwright
 *   2. Solving the Cloudflare Turnstile challenge
 *   3. Extracting the token
 *   4. Calling submitLumaRegistration with the token
 *   5. Updating job status in Supabase
 *
 * Usage:
 *   npx tsx scripts/process-batch-rsvp.ts [options]
 *
 * Options:
 *   --limit <n>     Max jobs to process (default: 50)
 *   --dry-run       Process but don't submit or update status
 *
 * Env vars:
 *   NEXT_PUBLIC_SUPABASE_URL   Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  Supabase service role key
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  limit: number;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    limit: 50,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--limit':
        result.limit = Math.max(1, parseInt(args[++i] || '50', 10));
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      default:
        console.warn(`Unknown argument: ${args[i]}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Supabase setup
// ---------------------------------------------------------------------------

function createSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Form-fill submission via Playwright
// ---------------------------------------------------------------------------

interface SubmissionResult {
  success: boolean;
  error?: string;
}

/**
 * Submit a Luma registration by filling the embed form via Playwright.
 *
 * Luma uses invisible Cloudflare Turnstile which injects a token on form submit.
 * Instead of trying to extract the token, we let Luma's own JS handle it by
 * filling and submitting the form natively, then intercepting the API response.
 */
async function submitViaPlaywright(
  lumaSlug: string,
  profile: Record<string, string>,
  customAnswers: Record<string, string>,
): Promise<SubmissionResult> {
  const { chromium } = await import('@playwright/test');

  // Use system Chrome in headed mode — Turnstile blocks headless browsers.
  // NOTE: Turnstile may still block Playwright-driven Chrome. If this doesn't
  // work, consider using a CAPTCHA-solving service or a persistent browser
  // session where the user solves Turnstile once.
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await browser.newPage();

  try {
    const embedUrl = `https://lu.ma/embed/event/${lumaSlug}/simple`;
    await page.goto(embedUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Click "Register" / "Request to Join" / "RSVP" button to open the form
    const registerBtn = page.locator(
      'button:has-text("Register"), button:has-text("Request to Join"), button:has-text("RSVP")'
    );
    const btnCount = await registerBtn.count();
    if (btnCount === 0) {
      return { success: false, error: 'No register button found on embed page' };
    }
    console.log(`    Found ${btnCount} register button(s), clicking first...`);
    await registerBtn.first().click();
    await page.waitForTimeout(2000);

    // Fill standard fields
    const nameInput = page.locator('input[placeholder="Your Name"], input[name="name"]').first();
    if (await nameInput.count() > 0) {
      const nameVal = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
      await nameInput.fill(nameVal);
      console.log(`    Filled name: ${nameVal}`);
    }

    const emailInput = page.locator('input[placeholder*="email"], input[type="email"], input[name="email"]').first();
    if (await emailInput.count() > 0) {
      await emailInput.fill(profile.email || '');
      console.log(`    Filled email: ${profile.email}`);
    }

    // Fill custom fields by scanning the form DOM in order.
    // Luma renders labels as div/span elements followed by the input/select.
    // We walk through each label-like element, match it to a custom answer by
    // question position, and fill the corresponding field.
    //
    // customAnswers is { questionId: value } ordered by form position.
    const answerEntries = Object.entries(customAnswers);

    // Luma renders labels with the class names we've seen.
    // The form fields appear in order: each label div is followed by an input/select.
    // Strategy: find all visible select + input fields (except name/email) and fill sequentially.

    // 1. Fill all native <select> dropdowns
    const selects = page.locator('select:visible');
    const selectCount = await selects.count();
    let selectIdx = 0;

    for (let i = 0; i < selectCount; i++) {
      const sel = selects.nth(i);
      // Find the matching answer (look for values that exist as options)
      for (let j = selectIdx; j < answerEntries.length; j++) {
        const [, val] = answerEntries[j];
        try {
          await sel.selectOption(val);
          console.log(`    Selected dropdown: ${val}`);
          selectIdx = j + 1;
          // Mark this answer as used
          answerEntries[j] = [answerEntries[j][0], '__USED__'];
          break;
        } catch {
          // This answer doesn't match this select, try next
        }
      }
    }

    // 2. Fill remaining text inputs with unused answers
    const unusedAnswers = answerEntries.filter(([, v]) => v !== '__USED__');
    let unusedIdx = 0;

    const allInputs = page.locator('input:visible');
    const inputCount = await allInputs.count();
    for (let i = 0; i < inputCount && unusedIdx < unusedAnswers.length; i++) {
      const input = allInputs.nth(i);
      const val = await input.inputValue();
      const placeholder = await input.getAttribute('placeholder') || '';
      const type = await input.getAttribute('type') || '';
      // Skip name, email, hidden, and already-filled inputs
      if (placeholder.includes('Your Name') || placeholder.includes('email')) continue;
      if (type === 'hidden' || type === 'checkbox') continue;
      if (val) continue; // Already has a value

      await input.fill(unusedAnswers[unusedIdx][1]);
      console.log(`    Filled input: ${unusedAnswers[unusedIdx][1]}`);
      unusedIdx++;
    }

    console.log(`    Form filled. Taking screenshot...`);
    await page.screenshot({ path: 'batch-rsvp-filled.png' }).catch(() => {});
    await page.waitForTimeout(1000);

    // Set up response interception to capture the registration result
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes('api.lu.ma') && res.url().includes('register'),
      { timeout: 45000 }
    ).catch(() => null);

    // Also log all outgoing API requests for debugging
    page.on('request', (req) => {
      if (req.url().includes('api.lu.ma')) {
        console.log(`    >> ${req.method()} ${req.url().slice(0, 80)}`);
      }
    });

    // Click the submit button (it's the last "Request to Join" button on the page)
    const submitBtn = page.locator(
      'button:has-text("Register"), button:has-text("Request to Join"), button:has-text("Submit")'
    ).last();
    console.log(`    Clicking submit...`);
    await submitBtn.click();

    // Wait for the API response (give Turnstile more time)
    console.log(`    Waiting for API response (up to 45s for Turnstile)...`);
    const response = await responsePromise;
    if (!response) {
      return { success: false, error: 'No API response received (timeout or Turnstile failed)' };
    }

    const status = response.status();
    const body = await response.json().catch(() => null);

    if (status >= 200 && status < 300) {
      return { success: true };
    }

    const errorMsg = body?.message || body?.error || body?.code || `HTTP ${status}`;
    return { success: false, error: errorMsg };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Job validation
// ---------------------------------------------------------------------------

const LUMA_SLUG_RE = /^[A-Za-z0-9_-]{1,100}$/;

/** Returns a rejection reason, or null if the job is safe to process. */
async function validateJob(
  supabase: SupabaseClient,
  job: { user_id: string; luma_slug: string; profile_snapshot: Record<string, string> | null },
): Promise<string | null> {
  if (!LUMA_SLUG_RE.test(job.luma_slug || '')) return 'Invalid Luma slug';
  const snapshotEmail = String(job.profile_snapshot?.email || '').trim().toLowerCase();
  if (!snapshotEmail) return 'Missing email';
  const { data, error } = await supabase.auth.admin.getUserById(job.user_id);
  if (error || !data?.user?.email) return 'Could not verify job owner';
  if (data.user.email.trim().toLowerCase() !== snapshotEmail) {
    return 'RSVP email does not match the account email';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Process a single job
// ---------------------------------------------------------------------------

async function processJob(
  supabase: SupabaseClient,
  job: {
    id: number;
    user_id: string;
    event_id: string;
    luma_slug: string;
    event_name: string | null;
    event_api_id: string;
    profile_snapshot: Record<string, string>;
    custom_answers: Record<string, string>;
  },
  dryRun: boolean,
): Promise<'success' | 'failed'> {
  const profile = job.profile_snapshot || {};

  // Defense in depth: job rows are user-writable under RLS, so re-validate
  // here (service role) before acting on the user's behalf.
  const rejection = await validateJob(supabase, job);
  if (rejection) {
    console.log(`  Rejected: ${rejection}`);
    if (!dryRun) {
      await supabase
        .from('batch_rsvp_jobs')
        .update({ status: 'failed', error_message: rejection, updated_at: new Date().toISOString() })
        .eq('id', job.id);
    }
    return 'failed';
  }

  console.log(`  Submitting via Playwright for ${job.luma_slug}...`);

  if (dryRun) {
    console.log('  [DRY RUN] Would submit registration');
    return 'success';
  }

  try {
    // Mark as submitting
    await supabase
      .from('batch_rsvp_jobs')
      .update({ status: 'submitting', updated_at: new Date().toISOString() })
      .eq('id', job.id);

    // Submit via Playwright (fills form + lets Luma handle Turnstile)
    const result = await submitViaPlaywright(job.luma_slug, profile, job.custom_answers);

    if (result.success) {
      await supabase
        .from('batch_rsvp_jobs')
        .update({
          status: 'success',
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      // Also create an RSVP record so the UI shows confirmed status
      await supabase
        .from('rsvps')
        .upsert({
          user_id: job.user_id,
          event_id: job.event_id,
          status: 'confirmed',
          method: 'batch',
        }, { onConflict: 'user_id,event_id' });

      return 'success';
    } else {
      await supabase
        .from('batch_rsvp_jobs')
        .update({
          status: 'failed',
          error_message: result.error || 'Unknown error',
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      return 'failed';
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('batch_rsvp_jobs')
      .update({
        status: 'failed',
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    return 'failed';
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();

  console.log('=== Batch RSVP Processor ===');
  console.log(`  Limit: ${args.limit}`);
  console.log(`  Dry run: ${args.dryRun}`);
  console.log('');

  const supabase = createSupabaseClient();

  // Fetch pending jobs
  const { data: jobs, error } = await supabase
    .from('batch_rsvp_jobs')
    .select('id, user_id, event_id, luma_slug, event_name, event_api_id, profile_snapshot, custom_answers')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(args.limit);

  if (error) {
    console.error('Failed to fetch pending jobs:', error.message);
    process.exit(1);
  }

  if (!jobs || jobs.length === 0) {
    console.log('No pending jobs to process.');
    return;
  }

  console.log(`Found ${jobs.length} pending job(s)`);
  console.log('');

  let totalSuccess = 0;
  let totalFailed = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const progress = `[${i + 1}/${jobs.length}]`;

    console.log(`${progress} ${job.event_name || job.luma_slug}`);

    const status = await processJob(supabase, job, args.dryRun);

    if (status === 'success') {
      totalSuccess++;
      console.log('  Result: SUCCESS');
    } else {
      totalFailed++;
      console.log('  Result: FAILED');
    }

    // 2s delay between submissions
    if (i < jobs.length - 1) {
      await delay(2000);
    }
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`  Processed: ${jobs.length}`);
  console.log(`  Success: ${totalSuccess}`);
  console.log(`  Failed: ${totalFailed}`);
  if (args.dryRun) {
    console.log('  (Dry run -- no submissions made)');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseBody, BatchRsvpSubmitSchema } from '@/lib/api-validation';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase env vars');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * POST /api/batch-rsvp — Create batch RSVP jobs from wizard data.
 *
 * The jobs are stored with status='pending' and must be processed
 * by the CLI script (scripts/process-batch-rsvp.ts) which uses
 * Playwright to solve the Turnstile captcha.
 */
export async function POST(request: NextRequest) {
  try {
    const { data, error } = await parseBody(request, BatchRsvpSubmitSchema);
    if (error) return error;

    // Get the user from the Authorization header (Supabase anon key auth)
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verify the JWT to get the user ID
    const token = authHeader.slice(7);
    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !userData?.user) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    // Users may only RSVP as themselves: the Luma registration email must be
    // the signed-in account's (OTP-verified) email.
    const authEmail = userData.user.email?.trim().toLowerCase();
    if (!authEmail || data.profile.email.trim().toLowerCase() !== authEmail) {
      return NextResponse.json(
        { error: 'RSVP email must match your signed-in email' },
        { status: 403 }
      );
    }

    // Build the profile snapshot
    const profileSnapshot: Record<string, string> = {
      email: data.profile.email,
      firstName: data.profile.firstName,
      lastName: data.profile.lastName,
    };
    if (data.profile.company) profileSnapshot.company = data.profile.company;
    if (data.profile.jobTitle) profileSnapshot.jobTitle = data.profile.jobTitle;
    if (data.profile.phone) profileSnapshot.phone = data.profile.phone;
    if (data.profile.telegram) profileSnapshot.telegram = data.profile.telegram;
    if (data.profile.xHandle) profileSnapshot.xHandle = data.profile.xHandle;
    if (data.profile.linkedin) profileSnapshot.linkedin = data.profile.linkedin;
    if (data.profile.website) profileSnapshot.website = data.profile.website;

    // Insert batch jobs
    const rows = data.events.map((event) => ({
      user_id: userId,
      event_id: event.eventId,
      luma_slug: event.lumaSlug,
      event_name: event.eventName,
      event_api_id: event.eventApiId,
      status: 'pending',
      profile_snapshot: profileSnapshot,
      custom_answers: event.customAnswers || {},
    }));

    const { data: insertedJobs, error: insertError } = await supabaseAdmin
      .from('batch_rsvp_jobs')
      .insert(rows)
      .select('id, event_id, event_name, status');

    if (insertError) {
      console.error('Batch RSVP insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create batch RSVP jobs' },
        { status: 500 }
      );
    }

    const jobs = insertedJobs ?? [];
    return NextResponse.json({
      jobs,
      message: `Created ${jobs.length} RSVP job(s). They will be processed shortly.`,
    });
  } catch (err) {
    console.error('Batch RSVP error:', err);
    return NextResponse.json(
      { error: 'Failed to create batch RSVP jobs' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/batch-rsvp?ids=1,2,3 — Poll job statuses.
 */
export async function GET(request: NextRequest) {
  try {
    const idsParam = request.nextUrl.searchParams.get('ids');
    if (!idsParam) {
      return NextResponse.json(
        { error: 'Missing ids parameter' },
        { status: 400 }
      );
    }

    const ids = idsParam.split(',').map(Number).filter(Boolean);
    if (ids.length === 0 || ids.length > 50) {
      return NextResponse.json(
        { error: 'Invalid ids (1-50 required)' },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    const token = authHeader.slice(7);
    const { data: userData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !userData?.user) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const { data: jobs, error: queryError } = await supabaseAdmin
      .from('batch_rsvp_jobs')
      .select('id, event_id, event_name, status, error_message, updated_at')
      .eq('user_id', userData.user.id)
      .in('id', ids);

    if (queryError) {
      return NextResponse.json(
        { error: 'Failed to fetch job statuses' },
        { status: 500 }
      );
    }

    return NextResponse.json({ jobs });
  } catch (err) {
    console.error('Batch RSVP GET error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch job statuses' },
      { status: 500 }
    );
  }
}

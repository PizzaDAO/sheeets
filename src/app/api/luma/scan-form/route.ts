import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseBody, ScanFormFieldsSchema } from '@/lib/api-validation';
import { scanLumaFormFields, type ScannedFormResult } from '@/lib/luma-form-scanner';

interface ScanResult {
  slug: string;
  result?: ScannedFormResult;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Require authentication to prevent abuse
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Fail closed: if the token can't be verified, refuse.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      console.error('Luma scan-form: missing Supabase env vars');
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const token = authHeader.slice(7);
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const { data, error } = await parseBody(request, ScanFormFieldsSchema);
    if (error) return error;

    const { slugs } = data;

    const results: ScanResult[] = await Promise.all(
      slugs.map(async (slug): Promise<ScanResult> => {
        try {
          const result = await scanLumaFormFields(slug);
          return { slug, result };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { slug, error: message };
        }
      })
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error('Luma scan-form error:', err);
    return NextResponse.json(
      { error: 'Failed to scan form fields' },
      { status: 500 }
    );
  }
}

/**
 * Get Admissions Analysis Edge Function
 *
 * Polling endpoint. Given a job_id (?id=<uuid>), reads the
 * admissions_analyses row and returns { status, result, error }.
 *
 * Deploy with: supabase functions deploy get-admissions-analysis --no-verify-jwt
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'Missing id query param' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('admissions_analyses')
    .select('status, result, error, file_name, file_size_bytes, model, created_at, completed_at')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('read failed:', error);
    return json({ error: 'Failed to read job' }, 500);
  }
  if (!data) return json({ error: 'Job not found' }, 404);

  return json(data);
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

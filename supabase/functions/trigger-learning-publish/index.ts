import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigins = new Set([
  'https://clicksable.com',
  'https://www.clicksable.com',
  'http://localhost:4173',
]);

const responseHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : 'https://clicksable.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
});

const json = (status: number, body: Record<string, unknown>, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
  });

Deno.serve(async request => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: responseHeaders(origin) });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' }, origin);
  if (origin && !allowedOrigins.has(origin)) return json(403, { error: 'This origin is not allowed.' }, origin);

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  let supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseAnonKey) {
    try { supabaseAnonKey = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || ''; }
    catch { supabaseAnonKey = ''; }
  }
  const githubToken = Deno.env.get('GITHUB_ACTIONS_TOKEN');
  if (!authorization?.startsWith('Bearer ') || !supabaseUrl || !supabaseAnonKey) {
    return json(401, { error: 'Sign in to HQ again, then retry.' }, origin);
  }
  if (!githubToken) return json(503, { error: 'The secure deployment token has not been configured yet.' }, origin);

  let body: { slug?: unknown };
  try { body = await request.json(); }
  catch { return json(400, { error: 'A valid article slug is required.' }, origin); }
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120) {
    return json(400, { error: 'The article URL slug is invalid.' }, origin);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json(401, { error: 'Your HQ session expired. Sign in again, then retry.' }, origin);

  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assurance?.currentLevel !== 'aal2') {
    return json(403, { error: 'Complete the HQ authenticator check again, then retry.' }, origin);
  }
  const { data: isAdmin, error: adminError } = await supabase.rpc('is_clicksable_hq_admin_mfa');
  if (adminError || isAdmin !== true) return json(403, { error: 'This HQ account is not authorized to publish articles.' }, origin);

  const { data: article, error: articleError } = await supabase
    .from('learning_articles')
    .select('slug,title,status,published_at')
    .eq('slug', slug)
    .maybeSingle();
  if (articleError || !article) return json(404, { error: 'The published article could not be confirmed in HQ.' }, origin);
  if (article.status !== 'published' || !article.published_at || new Date(article.published_at).getTime() > Date.now()) {
    return json(409, { error: 'This article is scheduled for later. Its public page will be built when its publish time arrives.' }, origin);
  }

  const githubResponse = await fetch(
    'https://api.github.com/repos/Rashidsuby/Clicksable/actions/workflows/publish-learning-center.yml/dispatches',
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'X-GitHub-Api-Version': '2026-03-10',
        'Content-Type': 'application/json',
        'User-Agent': 'Clicksable-HQ-Learning-Publisher',
      },
      body: JSON.stringify({ ref: 'main', inputs: { article_slug: slug } }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!githubResponse.ok) {
    console.error('GitHub workflow dispatch failed:', githubResponse.status, (await githubResponse.text()).slice(0, 300));
    return json(502, { error: 'The site build could not be started. Your article is saved in HQ; retry Publish to start the build.' }, origin);
  }

  return json(202, { accepted: true, slug, title: article.title }, origin);
});

// api/users/[id].js — get user profile + admin flag
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;

  // Verify the requesting user matches
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  // Upsert user profile on first visit
  const { data: profile } = await supabase
    .from('user_profiles')
    .upsert({
      id: user.id,
      email: user.email,
      display_name: user.user_metadata?.display_name || user.email.split('@')[0],
    }, { onConflict: 'id', ignoreDuplicates: false })
    .select()
    .single();

  return res.json({
    id: user.id,
    email: user.email,
    display_name: profile?.display_name || user.user_metadata?.display_name || user.email.split('@')[0],
    is_admin: profile?.is_admin || false,
  });
}

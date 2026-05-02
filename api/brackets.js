// api/brackets.js — GET published brackets / POST create bracket
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const onlyPublished = req.query.published === 'true';
    const now = new Date();
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('brackets')
      .select('id, title, category, contenders, created_at, vote_count, recent_vote_count, published')
      .order('created_at', { ascending: false })
      .limit(100);

    if (onlyPublished) query = query.eq('published', true);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  }

  if (req.method === 'POST') {
    // Verify auth
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    // Check domain
    if (!user.email?.endsWith('@msstate.edu')) {
      return res.status(403).json({ error: 'MSU email required' });
    }

    // Only admins can publish
    const { data: profile } = await supabase.from('user_profiles').select('is_admin').eq('id', user.id).single();
    const isAdmin = profile?.is_admin || false;
    const published = isAdmin && req.body.published === true;

    const { title, category, contenders, bracket_data } = req.body;
    if (!title || !contenders?.length) return res.status(400).json({ error: 'Missing fields' });

    const { data, error } = await supabase
      .from('brackets')
      .insert({ title, category, contenders, bracket_data, vote_count: 0, recent_vote_count: 0, published, created_by: user.id })
      .select().single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  res.status(405).json({ error: 'Method not allowed' });
}

// api/brackets/[id].js — GET bracket, POST vote, GET votes
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;

  // GET /api/brackets/:id — fetch bracket
  if (req.method === 'GET' && !req.url.includes('/votes')) {
    const { data, error } = await supabase
      .from('brackets')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return res.status(404).json({ error: 'Not found' });
    return res.json(data);
  }

  // GET /api/brackets/:id/votes — fetch all votes
  if (req.method === 'GET' && req.url.includes('/votes')) {
    const { data, error } = await supabase
      .from('votes')
      .select('id, voter_name, picks_data, champion, created_at')
      .eq('bracket_id', id)
      .order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  // POST /api/brackets/:id/votes — submit a vote
  if (req.method === 'POST' && req.url.includes('/votes')) {
    const { voter_name, picks, champion } = req.body;
    if (!voter_name || !picks) return res.status(400).json({ error: 'Missing fields' });

    const { data, error } = await supabase
      .from('votes')
      .insert({ bracket_id: id, voter_name, picks_data: picks, champion })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });

    // increment vote count
    await supabase.rpc('increment_vote_count', { bracket_id: id });

    return res.status(201).json(data);
  }

  res.status(405).json({ error: 'Method not allowed' });
}

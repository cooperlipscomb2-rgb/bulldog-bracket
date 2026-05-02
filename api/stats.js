// api/stats.js — global rankings across all brackets
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const category = req.query.category;

  // Get all votes with champion data
  let votesQuery = supabase.from('votes').select('voter_name, champion, bracket_id');
  if (category && category !== 'all') {
    // Join to filter by category
    const { data: bracketIds } = await supabase
      .from('brackets')
      .select('id')
      .eq('category', category);
    if (bracketIds?.length) {
      votesQuery = votesQuery.in('bracket_id', bracketIds.map(b => b.id));
    }
  }

  const { data: votes, error } = await votesQuery;
  if (error) return res.status(500).json({ error: error.message });

  // Tally champion wins
  const champCount = {};
  votes?.forEach(v => {
    if (v.champion) champCount[v.champion] = (champCount[v.champion] || 0) + 1;
  });
  const totalVotes = votes?.length || 0;

  const champions = Object.entries(champCount)
    .map(([name, wins]) => ({ name, wins, winRate: totalVotes > 0 ? (wins / totalVotes) * 100 : 0 }))
    .sort((a, b) => b.wins - a.wins);

  // Top voters
  const voterCount = {};
  votes?.forEach(v => {
    if (v.voter_name) voterCount[v.voter_name] = (voterCount[v.voter_name] || 0) + 1;
  });
  const topVoters = Object.entries(voterCount)
    .map(([voter_name, count]) => ({ voter_name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Total brackets
  let bracketsQuery = supabase.from('brackets').select('id', { count: 'exact', head: true });
  if (category && category !== 'all') bracketsQuery = bracketsQuery.eq('category', category);
  const { count: totalBrackets } = await bracketsQuery;

  return res.json({ champions, totalVotes, totalBrackets, topVoters });
}

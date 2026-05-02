// ============================================================
// BULLDOG BRACKET — app.js
// ============================================================

// ── CONFIG ──
const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';
const ALLOWED_DOMAIN = 'msstate.edu';
const ADMIN_EMAILS = []; // filled from DB — see isAdmin()

const PRESETS = {
  fastfood: { label:'Fast Food',   icon:'🍔', title:'Best Fast Food Chain',  contenders:["McDonald's","Chick-fil-A","Wendy's","Taco Bell","Burger King","Raising Cane's","Popeyes","In-N-Out"] },
  movies:   { label:'Movies',      icon:'🎬', title:'Greatest Movie Ever',    contenders:["The Dark Knight","Pulp Fiction","Forrest Gump","The Godfather","Interstellar","Goodfellas","Fight Club","Shawshank Redemption"] },
  nba:      { label:'NBA Players', icon:'🏀', title:'Greatest NBA Player',    contenders:["Michael Jordan","LeBron James","Kobe Bryant","Shaquille O'Neal","Magic Johnson","Larry Bird","Kareem Abdul-Jabbar","Stephen Curry"] },
  songs:    { label:'Songs',       icon:'🎵', title:'Greatest Song Ever',     contenders:["Bohemian Rhapsody","HUMBLE.","Lose Yourself","Thriller","Smells Like Teen Spirit","God's Plan","Rolling in the Deep","Blinding Lights"] },
  games:    { label:'Video Games', icon:'🎮', title:'Greatest Game Ever',     contenders:["GTA V","Zelda: BOTW","Red Dead 2","Minecraft","Elden Ring","The Last of Us","God of War","Fortnite"] },
  snacks:   { label:'Snacks',      icon:'🍿', title:'Best Snack Ever',        contenders:["Doritos","Oreos","Cheez-Its","Pringles","Takis","Goldfish","Hot Cheetos","Reese's Cups"] },
  sodas:    { label:'Sodas',       icon:'🥤', title:'Best Soda Ever',         contenders:["Coke","Pepsi","Dr Pepper","Mountain Dew","Sprite","Root Beer","Orange Fanta","Ginger Ale"] },
  custom:   { label:'Custom',      icon:'✏️', title:'', contenders:[] },
};

// ── STATE ──
let supabase = null;
let currentUser = null;
let isAdmin = false;
let publishEnabled = false;

let bracketState = {
  category: '',
  contenders: [],
  bracketName: '',
  bracketId: null,
  picks: {},
  voterName: '',
  viewMode: 'guided',
  bracketData: null,
  allVotes: [],
};

let currentFilter = 'all';
let currentStatsFilter = 'all';
let allBrackets = [];

// ── INIT ──
document.addEventListener('DOMContentLoaded', async () => {
  await initSupabase();
  initCategoryGrid();
  initLiveCounter();
});

async function initSupabase() {
  // Get config from backend
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    supabase = window.supabase.createClient(cfg.url, cfg.anonKey);
  } catch(e) {
    console.error('Could not load config', e);
    return;
  }

  // Check existing session
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await onSignedIn(session.user);
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) await onSignedIn(session.user);
    if (event === 'SIGNED_OUT') onSignedOut();
  });
}

async function onSignedIn(user) {
  currentUser = user;
  // Check admin
  try {
    const res = await fetch(`/api/users/${user.id}`);
    const data = await res.json();
    isAdmin = data.is_admin || false;
    const displayName = data.display_name || user.email.split('@')[0];
    document.getElementById('header-user-name').textContent = displayName;
    if (isAdmin) document.getElementById('admin-badge').classList.remove('hidden');
    // Pre-fill voter name
    bracketState.voterName = displayName;
  } catch(e) {
    document.getElementById('header-user-name').textContent = user.email.split('@')[0];
  }

  document.getElementById('auth-gate').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  showPage('trending');
}

function onSignedOut() {
  currentUser = null;
  isAdmin = false;
  document.getElementById('auth-gate').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

// ── AUTH ──
function switchAuthTab(tab) {
  document.getElementById('auth-login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('auth-signup-form').classList.toggle('hidden', tab !== 'signup');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');

  if (!email.endsWith('@' + ALLOWED_DOMAIN)) {
    errEl.textContent = 'Only @msstate.edu email addresses are allowed.';
    errEl.classList.remove('hidden');
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = error.message;
    errEl.classList.remove('hidden');
  }
}

async function handleSignup() {
  const email = document.getElementById('signup-email').value.trim();
  const name = document.getElementById('signup-name').value.trim();
  const password = document.getElementById('signup-password').value;
  const errEl = document.getElementById('signup-error');
  const sucEl = document.getElementById('signup-success');
  errEl.classList.add('hidden');
  sucEl.classList.add('hidden');

  if (!email.endsWith('@' + ALLOWED_DOMAIN)) {
    errEl.textContent = 'Only @msstate.edu email addresses are allowed.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!name) { errEl.textContent = 'Please enter your name.'; errEl.classList.remove('hidden'); return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.classList.remove('hidden'); return; }

  const { error } = await supabase.auth.signUp({
    email, password,
    options: { data: { display_name: name } }
  });

  if (error) {
    errEl.textContent = error.message;
    errEl.classList.remove('hidden');
  } else {
    sucEl.textContent = 'Check your MSU email for a confirmation link!';
    sucEl.classList.remove('hidden');
  }
}

async function handleSignout() {
  await supabase.auth.signOut();
}

// ── LIVE COUNTER ──
function initLiveCounter() {
  try {
    let sid = sessionStorage.getItem('bb-sid');
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('bb-sid', sid);
    }
    const es = new EventSource(`/api/live?sid=${sid}`);
    es.onmessage = e => {
      try { document.getElementById('live-count').textContent = JSON.parse(e.data).count; } catch(e) {}
    };
    es.onerror = () => es.close();
  } catch(e) {}
}

// ── PAGE NAV ──
const PAGES = ['trending','stats','create','vote-name','vote','results'];

function showPage(page) {
  PAGES.forEach(p => {
    const el = document.getElementById(`page-${p}`);
    if (el) el.classList.toggle('hidden', p !== page);
  });
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
  if (page === 'trending') loadTrending();
  if (page === 'stats') loadStats();
}

// ── TRENDING ──
async function loadTrending() {
  const el = document.getElementById('trending-list');
  el.innerHTML = '<div class="loading-msg">Loading...</div>';
  try {
    const res = await fetch('/api/brackets?published=true');
    allBrackets = await res.json();
    renderTrending();
  } catch(e) {
    el.innerHTML = '<div class="loading-msg">Failed to load brackets.</div>';
  }
}

function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll('#filter-row .filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === f);
  });
  renderTrending();
}

function renderTrending() {
  const el = document.getElementById('trending-list');
  let brackets = allBrackets;
  if (currentFilter !== 'all') brackets = brackets.filter(b => b.category === currentFilter);

  // Trending score: 60% recent votes (last 24h) + 40% total votes
  const now = Date.now();
  brackets = brackets.map(b => {
    const recentVotes = b.recent_vote_count || 0;
    const totalVotes = b.vote_count || 0;
    const ageHours = (now - new Date(b.created_at).getTime()) / 3600000;
    const score = totalVotes * 0.4 + recentVotes * 0.6;
    return { ...b, score, ageHours };
  }).sort((a, b) => b.score - a.score);

  if (!brackets.length) {
    el.innerHTML = `<div class="empty-state"><div class="big">🐾</div><p>No brackets here yet.<br>Be the first to create one!</p></div>`;
    return;
  }

  el.innerHTML = brackets.map((b, i) => {
    const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const isHot = b.recent_vote_count >= 3;
    const isNew = b.ageHours < 24;
    const preset = PRESETS[b.category];
    return `<div class="bracket-card" onclick="openBracket('${b.id}')">
      <div class="bracket-rank ${rankClass}">${i+1}</div>
      <div class="bracket-info">
        <div class="bracket-title">${esc(b.title)}</div>
        <div class="bracket-meta">
          <span>🗳 ${b.vote_count||0} votes</span>
          ${preset ? `<span>${preset.icon} ${preset.label}</span>` : ''}
          ${isHot ? `<span class="hot-badge">🔥 HOT</span>` : ''}
          ${isNew && !isHot ? `<span class="new-badge">NEW</span>` : ''}
        </div>
      </div>
      <div style="color:var(--muted);font-size:20px;">›</div>
    </div>`;
  }).join('');
}

async function openBracket(id) {
  try {
    const res = await fetch(`/api/brackets/${id}`);
    const bracket = await res.json();
    bracketState.bracketId = bracket.id;
    bracketState.bracketName = bracket.title;
    bracketState.category = bracket.category || 'custom';
    bracketState.contenders = bracket.contenders;
    bracketState.bracketData = bracket.bracket_data || buildBracket(bracket.contenders);
    bracketState.picks = {};
    document.getElementById('vote-title').textContent = bracket.title;
    document.getElementById('voter-name').value = bracketState.voterName;
    showPage('vote-name');
  } catch(e) { alert('Failed to load bracket.'); }
}

// ── RANKINGS / STATS ──
async function loadStats() {
  const el = document.getElementById('stats-content');
  el.innerHTML = '<div class="loading-msg">Loading rankings...</div>';
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    renderStats(data);
  } catch(e) {
    el.innerHTML = '<div class="loading-msg">Failed to load rankings.</div>';
  }
}

function setStatsFilter(f) {
  currentStatsFilter = f;
  document.querySelectorAll('#stats-filter-row .filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.sf === f);
  });
  loadStats();
}

function renderStats(data) {
  const el = document.getElementById('stats-content');
  if (!data || !data.champions || !data.champions.length) {
    el.innerHTML = `<div class="empty-state"><div class="big">📊</div><p>No votes yet. Get your Bulldogs voting!</p></div>`;
    return;
  }

  const { champions, totalVotes, totalBrackets, topVoters } = data;

  el.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-value">${totalVotes||0}</div><div class="stat-label">Total Votes</div></div>
      <div class="stat-card"><div class="stat-value">${totalBrackets||0}</div><div class="stat-label">Brackets</div></div>
      <div class="stat-card"><div class="stat-value">${champions.length||0}</div><div class="stat-label">Contenders Ranked</div></div>
    </div>

    <div class="section-label" style="margin-bottom:14px;">All-Time Champion Rankings</div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:28px;">
      <table class="rankings-table">
        <thead><tr>
          <th style="width:48px;">#</th>
          <th>Contender</th>
          <th>Wins</th>
          <th>Win Rate</th>
        </tr></thead>
        <tbody>
          ${champions.slice(0,20).map((c, i) => {
            const rankColor = i===0?'var(--gold)':i===1?'#aaa':i===2?'#cd7f32':'var(--dim)';
            const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
            return `<tr>
              <td class="rank-cell" style="color:${rankColor};">${medal||i+1}</td>
              <td style="font-weight:500;">${esc(c.name)}</td>
              <td style="color:var(--gold);font-weight:600;">${c.wins}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="flex:1;height:6px;background:var(--dark);border-radius:3px;overflow:hidden;">
                    <div style="height:100%;background:var(--gold);border-radius:3px;width:${Math.round(c.winRate)}%"></div>
                  </div>
                  <span style="font-size:12px;color:var(--muted);white-space:nowrap;">${Math.round(c.winRate)}%</span>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    ${topVoters && topVoters.length ? `
      <div class="section-label" style="margin-bottom:14px;">Most Active Bulldogs</div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;">
        <table class="rankings-table">
          <thead><tr><th>#</th><th>Bulldog</th><th>Brackets Voted</th></tr></thead>
          <tbody>
            ${topVoters.slice(0,10).map((v,i)=>`
              <tr>
                <td class="rank-cell" style="color:${i<3?'var(--gold)':'var(--dim)'};">${i+1}</td>
                <td style="font-weight:500;">${esc(v.voter_name)}</td>
                <td style="color:var(--gold);font-weight:600;">${v.count}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}
  `;
}

// ── CREATE / SETUP ──
let publishOn = false;

function togglePublish() {
  publishOn = !publishOn;
  document.getElementById('publish-switch').classList.toggle('on', publishOn);
}

function initCategoryGrid() {
  const grid = document.getElementById('cat-grid');
  if (!grid) return;
  grid.innerHTML = Object.entries(PRESETS).map(([id, p]) => `
    <button class="cat-btn" data-cat="${id}">
      <span class="cat-icon">${p.icon}</span>${p.label}
    </button>`).join('');
  grid.addEventListener('click', e => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    const cat = btn.dataset.cat;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    bracketState.category = cat;
    const preset = PRESETS[cat];
    bracketState.contenders = cat === 'custom' ? [] : [...preset.contenders];
    document.getElementById('custom-hint').classList.toggle('hidden', cat !== 'custom');
    if (cat !== 'custom' && !document.getElementById('bracket-name').value) {
      document.getElementById('bracket-name').value = preset.title;
      bracketState.bracketName = preset.title;
    }
    renderContenders();
  });
}

document.getElementById('bracket-name').addEventListener('input', e => {
  bracketState.bracketName = e.target.value;
  updateLaunchBtn();
});

document.getElementById('add-btn').addEventListener('click', () => {
  bracketState.contenders.push('');
  renderContenders();
  const inputs = document.querySelectorAll('.contender-input');
  const last = inputs[inputs.length - 1];
  if (last) last.focus();
});

document.getElementById('launch-btn').addEventListener('click', async () => {
  bracketState.contenders = bracketState.contenders.filter(c => c.trim());
  bracketState.bracketData = buildBracket(bracketState.contenders);
  try {
    const res = await fetch('/api/brackets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
      body: JSON.stringify({
        title: bracketState.bracketName,
        category: bracketState.category,
        contenders: bracketState.contenders,
        bracket_data: bracketState.bracketData,
        published: isAdmin && publishOn,
      })
    });
    const data = await res.json();
    bracketState.bracketId = data.id;
  } catch(e) { console.warn('Could not save bracket:', e); }

  document.getElementById('vote-title').textContent = bracketState.bracketName;
  document.getElementById('voter-name').value = bracketState.voterName;
  showPage('vote-name');
});

function renderContenders() {
  const n = bracketState.contenders.length;
  const section = document.getElementById('contenders-section');
  if (n === 0 && bracketState.category !== 'custom') { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  document.getElementById('contenders-count').textContent = n;
  const size = getBracketSize(n);
  const byes = size - n;
  const byeNote = byes > 0 ? "<span style=\"color:var(--gold)\">(+" + byes + " bye" + (byes > 1 ? "s" : "") + ")</span>" : "";
  document.getElementById("size-hint").innerHTML = n > 0
    ? n + " contenders → <span style=\"color:var(--muted)\">" + size + "-slot bracket</span> " + byeNote
    : "";
  // Show publish toggle only for admin
  document.getElementById('publish-wrap').classList.toggle('hidden', !isAdmin);
  updateLaunchBtn();

  const list = document.getElementById('contenders-list');
  list.innerHTML = bracketState.contenders.map((c, i) => `
    <div class="contender-item">
      <span class="contender-num">${i+1}</span>
      <input class="contender-input" data-idx="${i}" value="${esc(c)}" placeholder="Contender name">
      <button class="contender-del" data-del="${i}">×</button>
    </div>`).join('');
  list.querySelectorAll('.contender-input').forEach(inp => {
    inp.addEventListener('change', e => { bracketState.contenders[+e.target.dataset.idx] = e.target.value; updateLaunchBtn(); });
  });
  list.querySelectorAll('.contender-del').forEach(btn => {
    btn.addEventListener('click', () => { bracketState.contenders.splice(+btn.dataset.del, 1); renderContenders(); });
  });
}

function updateLaunchBtn() {
  const n = bracketState.contenders.filter(c => c.trim()).length;
  document.getElementById('launch-btn').disabled = n < 4 || !bracketState.bracketName.trim();
}

// ── BRACKET MATH ──
function getBracketSize(n) { return n <= 4 ? 4 : n <= 8 ? 8 : 16; }

function buildBracket(contenders) {
  const size = getBracketSize(contenders.length);
  const slots = [...contenders];
  while (slots.length < size) slots.push(null); // nulls = byes, placed at end
  const rounds = [];
  let cur = slots;
  while (cur.length > 1) {
    const matches = [];
    for (let i = 0; i < cur.length; i += 2) matches.push([cur[i], cur[i+1]]);
    rounds.push(matches);
    cur = new Array(matches.length).fill(null);
  }
  return rounds;
}

// Auto-advance ONLY genuine byes (null slot) — never cascade user picks
function resolveMatchups(picks, rounds) {
  const auto = { ...picks };
  // Only resolve round 0 byes — real matchups stay unresolved until user picks
  if (!rounds || !rounds[0]) return auto;
  rounds[0].forEach((match, m) => {
    const [a, b] = match;
    const key = `r0_${m}`;
    if (a && !b && !auto[key]) auto[key] = a;
    if (b && !a && !auto[key]) auto[key] = b;
  });
  return auto;
}

function getMatchups(picks, rounds) {
  if (!rounds) return [];
  const resolved = resolveMatchups(picks, rounds);
  const result = [];
  let teams = rounds[0].map(m => [...m]);
  for (let r = 0; r < rounds.length; r++) {
    for (let m = 0; m < teams.length; m++) {
      const [a, b] = teams[m];
      const key = `r${r}_${m}`;
      const isBye = (a && !b) || (!a && b);
      result.push({ round: r, match: m, key, a, b, isBye });
    }
    if (r + 1 < rounds.length) {
      const next = [];
      for (let m = 0; m < teams.length; m += 2) {
        next.push([resolved[`r${r}_${m}`] || null, resolved[`r${r}_${m+1}`] || null]);
      }
      teams = next;
    }
  }
  return result;
}

function getChampion(picks, rounds) {
  if (!rounds) return null;
  const resolved = resolveMatchups(picks, rounds);
  return resolved[`r${rounds.length - 1}_0`] || null;
}

function getRoundName(r, total) {
  const f = total - 1 - r;
  if (f === 0) return 'Final';
  if (f === 1) return 'Semifinals';
  if (f === 2) return 'Quarterfinals';
  return `Round ${r + 1}`;
}

// ── VOTING ──
function startVoting() {
  const name = document.getElementById('voter-name').value.trim();
  const errEl = document.getElementById('vote-name-error');
  if (!name) { errEl.textContent = 'Please enter your name.'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');
  bracketState.voterName = name;
  bracketState.picks = {};
  document.getElementById('voting-as-name').textContent = name;
  showPage('vote');
  renderVote();
}

function setView(mode) {
  bracketState.viewMode = mode;
  document.querySelectorAll('.toggle-btn').forEach((b, i) => b.classList.toggle('active', (i===0&&mode==='guided')||(i===1&&mode==='full')));
  document.getElementById('vote-guided').classList.toggle('hidden', mode !== 'guided');
  document.getElementById('vote-full').classList.toggle('hidden', mode !== 'full');
  renderVote();
}

function renderVote() {
  const rounds = bracketState.bracketData;
  const picks = bracketState.picks;
  const matchups = getMatchups(picks, rounds);
  const champion = getChampion(picks, rounds);
  const resolved = resolveMatchups(picks, rounds);
  const realMatchups = matchups.filter(m => m.a && m.b && !m.isBye);
  const filled = realMatchups.filter(m => resolved[m.key]).length;
  const total = realMatchups.length;

  document.getElementById('submit-picks-btn').style.display = champion ? 'block' : 'none';

  if (bracketState.viewMode === 'guided') renderGuided(matchups, rounds, champion, filled, total, resolved);
  else renderFull(rounds, matchups, resolved);
}

function renderGuided(matchups, rounds, champion, filled, total, resolved) {
  const el = document.getElementById('vote-guided');
  if (champion) {
    el.innerHTML = `<div class="matchup-screen">
      <div class="champion-card"><div class="champion-label">🏆 Your Champion</div><div class="champion-name">${esc(champion)}</div></div>
      <p style="text-align:center;color:var(--muted);font-size:14px;margin-bottom:18px;">All done! Hit Submit to save your picks.</p>
      <button class="btn-primary" style="width:100%;" onclick="submitPicks()">Submit My Picks →</button>
    </div>`;
    return;
  }

  // Find next unresolved real matchup
  let target = null;
  for (const m of matchups) {
    if (m.a && m.b && !m.isBye && !resolved[m.key]) { target = m; break; }
  }
  if (!target) { el.innerHTML = '<p style="text-align:center;color:var(--muted);padding:40px;">All caught up!</p>'; return; }

  const pct = total > 0 ? Math.round(filled / total * 100) : 0;
  el.innerHTML = `<div class="matchup-screen">
    <div class="round-badge">${getRoundName(target.round, rounds.length)}</div>
    <div class="progress-row">
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span class="progress-text">${filled} / ${total}</span>
    </div>
    <div class="matchup-cards">
      <div class="matchup-card${bracketState.picks[target.key]===target.a?' selected':''}" onclick="castPick('${target.key}','${esc(target.a).replace(/'/g,"\\'")}')">
        ${esc(target.a)}
      </div>
      <div class="vs-divider">VS</div>
      <div class="matchup-card${bracketState.picks[target.key]===target.b?' selected':''}" onclick="castPick('${target.key}','${esc(target.b).replace(/'/g,"\\'")}')">
        ${esc(target.b)}
      </div>
    </div>
  </div>`;
}

function renderFull(rounds, matchups, resolved) {
  const grouped = rounds.map((_, r) => matchups.filter(m => m.round === r));
  document.getElementById('vote-full').innerHTML = `<div class="bracket-view"><div class="bracket-grid">
    ${grouped.map((rM, r) => `<div class="bracket-round">
      <div class="bracket-round-label">${getRoundName(r, rounds.length)}</div>
      ${rM.map(m => {
        if (m.isBye) {
          const auto = m.a || m.b;
          return `<div class="bracket-match">
            <div class="bracket-slot bye-slot">${esc(auto)} <span style="font-size:10px;">(bye)</span></div>
          </div>`;
        }
        return `<div class="bracket-match">
          <div class="bracket-slot${!m.a?' empty':resolved[m.key]===m.a?' selected':''}" ${m.a&&m.b?`onclick="castPick('${m.key}','${(m.a||'').replace(/'/g,"\\'")}')"`:''}>
            ${esc(m.a)||'TBD'}
          </div>
          <div class="bracket-slot${!m.b?' empty':resolved[m.key]===m.b?' selected':''}" ${m.a&&m.b?`onclick="castPick('${m.key}','${(m.b||'').replace(/'/g,"\\'")}')"`:''}>
            ${esc(m.b)||'TBD'}
          </div>
        </div>`;
      }).join('')}
    </div>`).join('')}
  </div></div>`;
}

function castPick(key, winner) {
  bracketState.picks[key] = winner;
  renderVote();
}

async function submitPicks() {
  const champion = getChampion(bracketState.picks, bracketState.bracketData);
  try {
    const session = (await supabase.auth.getSession()).data.session;
    await fetch(`/api/brackets/${bracketState.bracketId}/votes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ voter_name: bracketState.voterName, picks: bracketState.picks, champion })
    });
  } catch(e) { console.warn('Could not save vote:', e); }
  await loadResultsScreen();
}

// ── RESULTS ──
async function loadResultsScreen() {
  showPage('results');
  document.getElementById('results-title').textContent = bracketState.bracketName;
  try {
    const res = await fetch(`/api/brackets/${bracketState.bracketId}/votes`);
    bracketState.allVotes = await res.json();
  } catch(e) { bracketState.allVotes = []; }
  renderResults();
}

function setResultsTab(tab) {
  document.querySelectorAll('.results-tab').forEach((b, i) => b.classList.toggle('active', (i===0&&tab==='overview')||(i===1&&tab==='picks')));
  document.getElementById('results-overview').classList.toggle('hidden', tab !== 'overview');
  document.getElementById('results-picks').classList.toggle('hidden', tab !== 'picks');
}

function renderResults() {
  const votes = bracketState.allVotes;
  const rounds = bracketState.bracketData;
  const champs = votes.map(v => getChampion(v.picks_data || v.picks, rounds)).filter(Boolean);
  const count = {};
  champs.forEach(c => { count[c] = (count[c] || 0) + 1; });
  const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];

  document.getElementById('results-champion').innerHTML = top ? `
    <div class="champion-card">
      <div class="champion-label">🏆 Group Champion · ${top[1]} of ${votes.length} vote${votes.length!==1?'s':''}</div>
      <div class="champion-name">${esc(top[0])}</div>
    </div>` : '';

  document.getElementById('results-overview').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-value">${votes.length}</div><div class="stat-label">Total Votes</div></div>
      <div class="stat-card"><div class="stat-value">${bracketState.contenders.length}</div><div class="stat-label">Contenders</div></div>
      <div class="stat-card"><div class="stat-value">${top ? Math.round(top[1]/votes.length*100) : 0}%</div><div class="stat-label">Top Agreement</div></div>
    </div>
    <div class="section-label" style="margin-bottom:12px;">Champion Breakdown</div>
    ${sorted.slice(0, 8).map(([name, n]) => {
      const pct = votes.length > 0 ? Math.round(n / votes.length * 100) : 0;
      return `<div class="bar-row">
        <div class="bar-label">${esc(name)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"><span class="bar-pct">${pct}%</span></div></div>
      </div>`;
    }).join('')}`;

  document.getElementById('results-picks').innerHTML = votes.length ? votes.map(v => {
    const champ = getChampion(v.picks_data || v.picks, rounds);
    const picks = Object.values(v.picks_data || v.picks || {}).filter(Boolean);
    return `<div class="voter-result-card">
      <div class="voter-result-name">
        ${esc(v.voter_name)}
        ${champ ? `<span class="voter-champ-badge">🏆 ${esc(champ)}</span>` : ''}
      </div>
      <div class="mini-picks">${picks.map((p, i) => `<div class="mini-pick${p===champ&&i===picks.length-1?' champ':''}">${esc(p)}</div>`).join('')}</div>
    </div>`;
  }).join('') : '<p style="color:var(--muted);font-size:14px;">No votes yet.</p>';
}

function voteAgain() {
  bracketState.picks = {};
  bracketState.voterName = currentUser ? document.getElementById('header-user-name').textContent : '';
  document.getElementById('voter-name').value = bracketState.voterName;
  showPage('vote-name');
}

// ── UTILS ──
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

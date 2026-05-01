// ============================================================
// BULLDOG BRACKET — app.js
// ============================================================

const PRESETS = {
  fastfood: { label:'Fast Food', icon:'🍔', title:'Best Fast Food Chain', contenders:["McDonald's","Chick-fil-A","Wendy's","Taco Bell","Burger King","Raising Cane's","Popeyes","In-N-Out"] },
  movies:   { label:'Movies',    icon:'🎬', title:'Greatest Movie Ever',  contenders:["The Dark Knight","Pulp Fiction","Forrest Gump","The Godfather","Interstellar","Goodfellas","Fight Club","Shawshank Redemption"] },
  nba:      { label:'NBA Players',icon:'🏀', title:'Greatest NBA Player',  contenders:["Michael Jordan","LeBron James","Kobe Bryant","Shaquille O'Neal","Magic Johnson","Larry Bird","Kareem Abdul-Jabbar","Stephen Curry"] },
  songs:    { label:'Songs',     icon:'🎵', title:'Greatest Song Ever',   contenders:["Bohemian Rhapsody","HUMBLE.","Lose Yourself","Thriller","Smells Like Teen Spirit","God's Plan","Rolling in the Deep","Blinding Lights"] },
  games:    { label:'Video Games',icon:'🎮', title:'Greatest Game Ever',   contenders:["GTA V","Zelda: BOTW","Red Dead 2","Minecraft","Elden Ring","The Last of Us","God of War","Fortnite"] },
  snacks:   { label:'Snacks',    icon:'🍿', title:'Best Snack Ever',       contenders:["Doritos","Oreos","Cheez-Its","Pringles","Takis","Goldfish","Hot Cheetos","Reese's Cups"] },
  sodas:    { label:'Sodas',     icon:'🥤', title:'Best Soda Ever',        contenders:["Coke","Pepsi","Dr Pepper","Mountain Dew","Sprite","Root Beer","Orange Fanta","Ginger Ale"] },
  custom:   { label:'Custom',    icon:'✏️', title:'', contenders:[] },
};

// ---- STATE ----
let state = {
  category: '',
  contenders: [],
  bracketName: '',
  bracketId: null,       // saved bracket id from backend
  picks: {},
  voterName: '',
  voterId: null,
  viewMode: 'guided',
  resultsTab: 'overview',
  allVotes: [],
  bracketData: null,
};

// ---- BRACKET MATH ----
function getBracketSize(n) { return n<=4?4:n<=8?8:16; }

function buildBracket(contenders) {
  const size = getBracketSize(contenders.length);
  const slots = [...contenders];
  while (slots.length < size) slots.push(null);
  const rounds = [];
  let cur = slots;
  while (cur.length > 1) {
    const matches = [];
    for (let i=0; i<cur.length; i+=2) matches.push([cur[i], cur[i+1]]);
    rounds.push(matches);
    cur = new Array(matches.length).fill(null);
  }
  return rounds;
}

function getMatchups(picks, rounds) {
  const result = [];
  let teams = rounds[0].map(m=>[...m]);
  for (let r=0; r<rounds.length; r++) {
    for (let m=0; m<teams.length; m++) {
      result.push({round:r, match:m, key:`r${r}_${m}`, a:teams[m][0], b:teams[m][1]});
    }
    if (r+1<rounds.length) {
      const next=[];
      for (let m=0; m<teams.length; m+=2) next.push([picks[`r${r}_${m}`]||null, picks[`r${r}_${m+1}`]||null]);
      teams=next;
    }
  }
  return result;
}

function getChampion(picks, rounds) { return picks[`r${rounds.length-1}_0`]||null; }

function getRoundName(r, total) {
  const f = total-1-r;
  if(f===0) return 'Final';
  if(f===1) return 'Semifinals';
  if(f===2) return 'Quarterfinals';
  return `Round ${r+1}`;
}

function esc(s) {
  if(!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- API CALLS ----
async function apiPost(path, body) {
  const res = await fetch(path, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function apiGet(path) {
  const res = await fetch(path);
  if(!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

async function saveBracket() {
  const data = await apiPost('/api/brackets', {
    title: state.bracketName,
    category: state.category,
    contenders: state.contenders,
    bracket_data: state.bracketData,
  });
  state.bracketId = data.id;
  return data.id;
}

async function saveVote() {
  const champion = getChampion(state.picks, state.bracketData);
  const data = await apiPost(`/api/brackets/${state.bracketId}/votes`, {
    voter_name: state.voterName,
    picks: state.picks,
    champion,
  });
  state.voterId = data.id;
}

async function loadVotes() {
  const data = await apiGet(`/api/brackets/${state.bracketId}/votes`);
  state.allVotes = data;
}

async function loadBrackets() {
  return apiGet('/api/brackets');
}

// ---- LIVE COUNTER (SSE) ----
function initLiveCounter() {
  try {
    const es = new EventSource('/api/live');
    es.onmessage = e => {
      const data = JSON.parse(e.data);
      document.getElementById('live-count').textContent = data.count;
    };
  } catch(e) {
    console.log('SSE not available');
  }
}

// ---- PAGE NAVIGATION ----
function showPage(page) {
  document.getElementById('page-home').classList.toggle('hidden', page!=='home');
  document.getElementById('page-browse').classList.toggle('hidden', page!=='browse');
  document.querySelectorAll('.nav-btn').forEach((b,i)=>{
    b.classList.toggle('active', (i===0&&page==='home')||(i===1&&page==='browse'));
  });
  if(page==='browse') loadBrowsePage();
}

async function loadBrowsePage() {
  const list = document.getElementById('browse-list');
  list.innerHTML = '<div class="loading-msg">Loading brackets...</div>';
  try {
    const brackets = await loadBrackets();
    if(!brackets.length) { list.innerHTML='<div class="loading-msg">No brackets yet — be the first!</div>'; return; }
    list.innerHTML = brackets.map(b=>`
      <div class="bracket-card" onclick="openBracket('${b.id}')">
        <div class="bracket-card-title">${esc(b.title)}</div>
        <div class="bracket-card-meta">
          <span>🗳 ${b.vote_count||0} votes</span>
          <span>📅 ${new Date(b.created_at).toLocaleDateString()}</span>
          ${b.category&&b.category!=='custom'?`<span>${PRESETS[b.category]?.icon||''} ${PRESETS[b.category]?.label||b.category}</span>`:''}
        </div>
      </div>`).join('');
  } catch(e) {
    list.innerHTML='<div class="error-msg">Failed to load brackets.</div>';
  }
}

async function openBracket(id) {
  showPage('home');
  try {
    const bracket = await apiGet(`/api/brackets/${id}`);
    state.bracketId = bracket.id;
    state.bracketName = bracket.title;
    state.category = bracket.category||'custom';
    state.contenders = bracket.contenders;
    state.bracketData = bracket.bracket_data || buildBracket(bracket.contenders);
    state.picks = {};
    state.voterName = '';
    showScreen('vote-name');
    document.getElementById('vote-title').textContent = state.bracketName;
  } catch(e) {
    alert('Failed to load bracket.');
  }
}

// ---- SCREENS ----
function showScreen(name) {
  ['setup','vote-name','vote','results'].forEach(s=>{
    document.getElementById(`screen-${s}`).classList.toggle('hidden', s!==name);
  });
}

function goSetup() {
  state = { category:'', contenders:[], bracketName:'', bracketId:null, picks:{}, voterName:'', voterId:null, viewMode:'guided', resultsTab:'overview', allVotes:[], bracketData:null };
  showScreen('setup');
  renderSetupContenders();
  document.getElementById('bracket-name').value='';
  document.querySelectorAll('.cat-btn').forEach(b=>b.classList.remove('active'));
}

// ---- SETUP ----
function initCategoryGrid() {
  const grid = document.getElementById('cat-grid');
  grid.innerHTML = Object.entries(PRESETS).map(([id,p])=>`
    <button class="cat-btn" data-cat="${id}">
      <span class="cat-icon">${p.icon}</span>${p.label}
    </button>`).join('');
  grid.addEventListener('click', e=>{
    const btn = e.target.closest('.cat-btn');
    if(!btn) return;
    const cat = btn.dataset.cat;
    document.querySelectorAll('.cat-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.category = cat;
    const preset = PRESETS[cat];
    if(cat==='custom') {
      state.contenders = [];
      document.getElementById('custom-hint').classList.remove('hidden');
    } else {
      state.contenders = [...preset.contenders];
      document.getElementById('custom-hint').classList.add('hidden');
      if(!document.getElementById('bracket-name').value) {
        document.getElementById('bracket-name').value = preset.title;
        state.bracketName = preset.title;
      }
    }
    renderSetupContenders();
  });
}

function renderSetupContenders() {
  const n = state.contenders.length;
  const section = document.getElementById('contenders-section');
  if(n===0 && state.category!=='custom') { section.classList.add('hidden'); return; }
  section.classList.remove('hidden');
  document.getElementById('contenders-count').textContent = n;
  const size = getBracketSize(n);
  document.getElementById('size-hint').innerHTML = n>0 ? `${n} contenders → <span>${size}-slot bracket</span>${n<size?` (${size-n} bye${size-n>1?'s':''})`:''}` : '';
  const canLaunch = n>=4 && state.bracketName.trim().length>0;
  document.getElementById('launch-btn').disabled = !canLaunch;
  const list = document.getElementById('contenders-list');
  list.innerHTML = state.contenders.map((c,i)=>`
    <div class="contender-item">
      <span class="contender-num">${i+1}</span>
      <input class="contender-input" data-idx="${i}" value="${esc(c)}" placeholder="Contender name">
      <button class="contender-del" data-del="${i}">×</button>
    </div>`).join('');
  list.querySelectorAll('.contender-input').forEach(inp=>{
    inp.addEventListener('change', e=>{ state.contenders[+e.target.dataset.idx]=e.target.value; renderSetupContenders(); });
  });
  list.querySelectorAll('.contender-del').forEach(btn=>{
    btn.addEventListener('click',()=>{ state.contenders.splice(+btn.dataset.del,1); renderSetupContenders(); });
  });
}

document.getElementById('bracket-name').addEventListener('input', e=>{
  state.bracketName = e.target.value;
  renderSetupContenders();
});

document.getElementById('add-btn').addEventListener('click',()=>{
  state.contenders.push('');
  renderSetupContenders();
  const inputs = document.querySelectorAll('.contender-input');
  const last = inputs[inputs.length-1];
  if(last){last.focus();}
});

document.getElementById('launch-btn').addEventListener('click', async ()=>{
  state.contenders = state.contenders.filter(c=>c.trim());
  state.bracketData = buildBracket(state.contenders);
  try {
    await saveBracket();
  } catch(e) { console.warn('Could not save bracket:', e); }
  showScreen('vote-name');
  document.getElementById('vote-title').textContent = state.bracketName;
});

// ---- VOTE NAME ----
document.getElementById('start-vote-btn').addEventListener('click',()=>{
  const name = document.getElementById('voter-name').value.trim();
  if(!name) { showError('vote-error','Please enter your name.'); return; }
  hideError('vote-error');
  state.voterName = name;
  state.picks = {};
  showScreen('vote');
  document.getElementById('voting-as-name').textContent = name;
  renderVote();
});

document.getElementById('vote-again-btn').addEventListener('click',()=>{
  state.voterName='';
  state.picks={};
  showScreen('vote-name');
  document.getElementById('voter-name').value='';
});

// ---- VOTING ----
function setView(mode) {
  state.viewMode = mode;
  document.querySelectorAll('.toggle-btn').forEach((b,i)=>{
    b.classList.toggle('active',(i===0&&mode==='guided')||(i===1&&mode==='full'));
  });
  document.getElementById('vote-guided').classList.toggle('hidden', mode!=='guided');
  document.getElementById('vote-full').classList.toggle('hidden', mode!=='full');
  renderVote();
}

function renderVote() {
  const rounds = state.bracketData;
  const matchups = getMatchups(state.picks, rounds);
  const champion = getChampion(state.picks, rounds);
  const filled = matchups.filter(m=>state.picks[m.key]&&m.a&&m.b).length;
  const total = matchups.filter(m=>m.a&&m.b).length;

  const submitBtn = document.getElementById('submit-picks-btn');
  submitBtn.style.display = champion ? 'block' : 'none';

  if(state.viewMode==='guided') {
    renderGuided(matchups, rounds, champion, filled, total);
  } else {
    renderFull(rounds, matchups);
  }
}

function renderGuided(matchups, rounds, champion, filled, total) {
  const el = document.getElementById('vote-guided');
  if(champion) {
    el.innerHTML = `<div class="matchup-screen">
      <div class="champion-card"><div class="champion-label">🏆 Your Champion</div><div class="champion-name">${esc(champion)}</div></div>
      <p style="text-align:center;color:var(--muted);font-size:14px;margin-bottom:20px;">All done! Hit Submit to save your picks.</p>
      <button class="btn-primary" style="width:100%;" onclick="submitPicks()">Submit My Picks →</button>
    </div>`;
    return;
  }
  let target=null;
  for(const m of matchups){if(m.a&&m.b&&!state.picks[m.key]){target=m;break;}}
  if(!target){el.innerHTML='<p style="color:var(--muted);text-align:center;padding:40px;">All caught up!</p>';return;}
  const pct = total>0 ? Math.round(filled/total*100) : 0;
  el.innerHTML = `<div class="matchup-screen">
    <div class="round-badge">${getRoundName(target.round,rounds.length)}</div>
    <div class="progress-row">
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span class="progress-text">${filled} / ${total}</span>
    </div>
    <div class="matchup-cards">
      <div class="matchup-card${state.picks[target.key]===target.a?' selected':''}" onclick="pick('${target.key}','${target.a.replace(/'/g,"\\'")}')">
        ${esc(target.a)}
      </div>
      <div class="vs-divider">VS</div>
      <div class="matchup-card${state.picks[target.key]===target.b?' selected':''}" onclick="pick('${target.key}','${target.b.replace(/'/g,"\\'")}')">
        ${esc(target.b)}
      </div>
    </div>
  </div>`;
}

function renderFull(rounds, matchups) {
  const grouped = rounds.map((_,r)=>matchups.filter(m=>m.round===r));
  document.getElementById('vote-full').innerHTML = `<div class="bracket-view"><div class="bracket-grid">
    ${grouped.map((rM,r)=>`<div class="bracket-round">
      <div class="bracket-round-label">${getRoundName(r,rounds.length)}</div>
      ${rM.map(m=>`<div class="bracket-match">
        <div class="bracket-slot${!m.a?' empty':state.picks[m.key]===m.a?' selected':''}" ${m.a&&m.b?`onclick="pick('${m.key}','${(m.a||'').replace(/'/g,"\\'")}')"`:''}>${esc(m.a)||'TBD'}</div>
        <div class="bracket-slot${!m.b?' empty':state.picks[m.key]===m.b?' selected':''}" ${m.a&&m.b?`onclick="pick('${m.key}','${(m.b||'').replace(/'/g,"\\'")}')"`:''}>${esc(m.b)||'TBD'}</div>
      </div>`).join('')}
    </div>`).join('')}
  </div></div>`;
}

function pick(key, winner) {
  state.picks[key] = winner;
  renderVote();
}

document.getElementById('submit-picks-btn').addEventListener('click', submitPicks);

async function submitPicks() {
  try { await saveVote(); } catch(e) { console.warn('Could not save vote:', e); }
  await loadResultsScreen();
}

// ---- RESULTS ----
async function loadResultsScreen() {
  showScreen('results');
  document.getElementById('results-title').textContent = state.bracketName;
  try { await loadVotes(); } catch(e) { state.allVotes=[]; }
  renderResults();
}

function setResultsTab(tab) {
  state.resultsTab = tab;
  document.querySelectorAll('.results-tab').forEach((b,i)=>{
    b.classList.toggle('active',(i===0&&tab==='overview')||(i===1&&tab==='picks'));
  });
  document.getElementById('results-overview').classList.toggle('hidden', tab!=='overview');
  document.getElementById('results-picks').classList.toggle('hidden', tab!=='picks');
}

function renderResults() {
  const votes = state.allVotes;
  const rounds = state.bracketData;
  const champs = votes.map(v=>getChampion(v.picks||v.picks_data,rounds)).filter(Boolean);
  const count = {};
  champs.forEach(c=>{count[c]=(count[c]||0)+1;});
  const sorted = Object.entries(count).sort((a,b)=>b[1]-a[1]);
  const top = sorted[0];

  // Champion card
  document.getElementById('results-champion').innerHTML = top ? `
    <div class="champion-card">
      <div class="champion-label">🏆 Group Champion · ${top[1]} of ${votes.length} vote${votes.length!==1?'s':''}</div>
      <div class="champion-name">${esc(top[0])}</div>
    </div>` : '';

  // Overview tab
  const myChamp = getChampion(state.picks, rounds);
  document.getElementById('results-overview').innerHTML = `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-value">${votes.length}</div><div class="stat-label">Total Votes</div></div>
      <div class="stat-card"><div class="stat-value">${state.contenders.length}</div><div class="stat-label">Contenders</div></div>
      <div class="stat-card"><div class="stat-value">${top?Math.round(top[1]/votes.length*100):0}%</div><div class="stat-label">Winner Agreement</div></div>
    </div>
    <div class="section-label" style="margin-bottom:12px;">Champion Votes</div>
    <div class="bar-chart">
      ${sorted.slice(0,8).map(([name,n])=>{
        const pct = votes.length>0?Math.round(n/votes.length*100):0;
        return `<div class="bar-row">
          <div class="bar-label">${esc(name)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"><span class="bar-pct">${pct}%</span></div></div>
        </div>`;
      }).join('')}
    </div>`;

  // Picks tab
  document.getElementById('results-picks').innerHTML = votes.length ? votes.map(v=>{
    const champ = getChampion(v.picks||v.picks_data, rounds);
    const picks = Object.values(v.picks||v.picks_data||{}).filter(Boolean);
    return `<div class="voter-result-card">
      <div class="voter-result-name">
        ${esc(v.voter_name||v.name)}
        ${champ?`<span class="voter-champ-badge">🏆 ${esc(champ)}</span>`:''}
      </div>
      <div class="mini-picks">${picks.map((p,i)=>`<div class="mini-pick${p===champ&&i===picks.length-1?' champ':''}">${esc(p)}</div>`).join('')}</div>
    </div>`;
  }).join('') : '<p style="color:var(--muted);font-size:14px;">No votes yet.</p>';
}

// ---- UTILS ----
function showError(id, msg) { const el=document.getElementById(id); el.textContent=msg; el.classList.remove('hidden'); }
function hideError(id) { document.getElementById(id).classList.add('hidden'); }

// ---- INIT ----
initCategoryGrid();
initLiveCounter();
showScreen('setup');

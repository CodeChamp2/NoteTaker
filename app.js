const STORAGE_KEY  = 'notetaker_notes';
const SETTINGS_KEY = 'notetaker_settings';
const REVEAL_WIDTH  = 140;
const SWIPE_THRESHOLD = 55;

const THEMES = [
  { id: 'midnight', name: 'Midnight', bg: '#1a1a2e', sidebarBg: '#16213e', cardBg: '#0f3460', accent: '#e94560', text: '#e0e0e0', muted: '#888888', border: '#2a2a4a' },
  { id: 'forest',   name: 'Forest',   bg: '#0d1f1a', sidebarBg: '#0a1a15', cardBg: '#0f2d20', accent: '#2ecc71', text: '#d8f0e0', muted: '#7a9a80', border: '#1a3a28' },
  { id: 'dusk',     name: 'Dusk',     bg: '#1a0a2e', sidebarBg: '#160a28', cardBg: '#2a0a4a', accent: '#a855f7', text: '#e8d8f0', muted: '#8a78a0', border: '#2a1a40' },
  { id: 'ember',    name: 'Ember',    bg: '#1a1208', sidebarBg: '#14100a', cardBg: '#2a1e0a', accent: '#f97316', text: '#f0e8d8', muted: '#a09078', border: '#3a2a10' },
  { id: 'arctic',   name: 'Arctic',   bg: '#f0f4f8', sidebarBg: '#e8edf2', cardBg: '#dde4ed', accent: '#3b82f6', text: '#1a2332', muted: '#64748b', border: '#c8d5e8' },
];

let currentTheme    = THEMES[0];
let customPrimary   = null; // overrides --accent
let customSecondary = null; // overrides --bg
let gradientEnabled = false;
let starsEnabled    = false;

let notes = [];
let activeId = null;
let saveTimer = null;
let revealedItem = null; // { li, content }

// ── DOM refs ──
const noteList       = document.getElementById('note-list');
const newNoteBtn     = document.getElementById('new-note-btn');
const newNoteFab     = document.getElementById('new-note-fab');
const settingsBtn    = document.getElementById('settings-btn');
const settingsPanel  = document.getElementById('settings-panel');
const settingsSheet  = settingsPanel.querySelector('.settings-sheet');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const themeGrid      = document.getElementById('theme-grid');
const colorPrimary    = document.getElementById('color-primary');
const colorSecondary  = document.getElementById('color-secondary');
const skyOverlay      = document.getElementById('sky-overlay');
const starsCanvas     = document.getElementById('stars-canvas');
const toggleGradient  = document.getElementById('toggle-gradient');
const toggleStars     = document.getElementById('toggle-stars');
const starsToggleRow  = document.getElementById('stars-toggle-row');
const searchInput = document.getElementById('search');
const noteTitle   = document.getElementById('note-title');
const noteBody    = document.getElementById('note-body');
const deleteBtn   = document.getElementById('delete-btn');
const backBtn     = document.getElementById('back-btn');
const lastSaved   = document.getElementById('last-saved');
const emptyState  = document.getElementById('empty-state');
const appEl       = document.querySelector('.app');
const welcomeEl   = document.getElementById('welcome');

// ── Persistence ──
function load() {
  try { notes = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { notes = []; }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

// ── Settings persistence ──
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    currentTheme    = THEMES.find(t => t.id === s.themeId) || THEMES[0];
    customPrimary   = s.customPrimary   || null;
    customSecondary = s.customSecondary || null;
    gradientEnabled = s.gradientEnabled ?? false;
    starsEnabled    = s.starsEnabled    ?? false;
  } catch { currentTheme = THEMES[0]; }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    themeId: currentTheme.id, customPrimary, customSecondary,
    gradientEnabled, starsEnabled,
  }));
}

function applyTheme() {
  const r = document.documentElement;
  r.style.setProperty('--bg',         customSecondary || currentTheme.bg);
  r.style.setProperty('--sidebar-bg', currentTheme.sidebarBg);
  r.style.setProperty('--card-bg',    currentTheme.cardBg);
  r.style.setProperty('--accent',     customPrimary   || currentTheme.accent);
  r.style.setProperty('--text',       currentTheme.text);
  r.style.setProperty('--muted',      currentTheme.muted);
  r.style.setProperty('--border',     currentTheme.border);
  updateOverlay();
}

// ── Sky overlay + stars ──
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function isDarkTheme() {
  const [r, g, b] = hexToRgb(customSecondary || currentTheme.bg);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

function drawStars(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const count = Math.round((W * H) / 1400);

  for (let i = 0; i < count; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const rand = Math.random();

    // Natural size distribution: mostly tiny, few prominent
    let radius;
    if      (rand < 0.70) radius = Math.random() * 0.45 + 0.15; // tiny (70%)
    else if (rand < 0.92) radius = Math.random() * 0.65 + 0.55; // medium (22%)
    else                  radius = Math.random() * 0.85 + 1.15; // bright (8%)

    const brightness = Math.random() * 0.5 + 0.45;

    // Subtle color temperature variation (like real stars)
    let sr = 255, sg = 255, sb = 255;
    const hue = Math.random();
    if      (hue < 0.28) { sr = 200; sg = 220; sb = 255; } // blue-white (hot)
    else if (hue < 0.46) { sr = 255; sg = 245; sb = 210; } // warm yellow-white

    // Wide glow halo for all but the tiniest stars
    if (radius > 0.5) {
      const haloR = radius * 6;
      const halo = ctx.createRadialGradient(x, y, 0, x, y, haloR);
      halo.addColorStop(0,   `rgba(${sr},${sg},${sb},${brightness * 0.45})`);
      halo.addColorStop(0.35,`rgba(${sr},${sg},${sb},${brightness * 0.12})`);
      halo.addColorStop(1,   `rgba(${sr},${sg},${sb},0)`);
      ctx.beginPath();
      ctx.arc(x, y, haloR, 0, Math.PI * 2);
      ctx.fillStyle = halo;
      ctx.fill();
    }

    // Extra diffuse glow for the bright stars
    if (radius > 1.1) {
      const bigR = radius * 14;
      const bigGlow = ctx.createRadialGradient(x, y, 0, x, y, bigR);
      bigGlow.addColorStop(0, `rgba(${sr},${sg},${sb},${brightness * 0.18})`);
      bigGlow.addColorStop(1, `rgba(${sr},${sg},${sb},0)`);
      ctx.beginPath();
      ctx.arc(x, y, bigR, 0, Math.PI * 2);
      ctx.fillStyle = bigGlow;
      ctx.fill();
    }

    // Sharp star core
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${sr},${sg},${sb},${brightness})`;
    ctx.fill();
  }
}

function updateOverlay() {
  if (!gradientEnabled) {
    skyOverlay.style.display = 'none';
    starsCanvas.style.display = 'none';
    return;
  }

  skyOverlay.style.display = 'block';

  if (isDarkTheme()) {
    skyOverlay.style.background =
      'linear-gradient(to bottom, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 55%, transparent 100%)';
  } else {
    const [rv, gv, bv] = hexToRgb(customPrimary || currentTheme.accent);
    skyOverlay.style.background =
      `linear-gradient(to bottom, rgba(${rv},${gv},${bv},0.72) 0%, rgba(${rv},${gv},${bv},0.25) 55%, transparent 100%)`;
  }

  if (starsEnabled && isDarkTheme()) {
    starsCanvas.style.display = 'block';
    starsCanvas.width  = skyOverlay.offsetWidth  || window.innerWidth;
    starsCanvas.height = skyOverlay.offsetHeight || 240;
    drawStars(starsCanvas);
  } else {
    starsCanvas.style.display = 'none';
  }
}

// ── Settings panel ──
function renderThemeSwatches() {
  themeGrid.innerHTML = '';
  THEMES.forEach(theme => {
    const btn = document.createElement('button');
    btn.className = 'theme-swatch' + (theme.id === currentTheme.id ? ' active' : '');
    btn.title = theme.name;
    btn.innerHTML = `
      <div class="swatch-preview">
        <div style="position:absolute;inset:0;background:${theme.bg}"></div>
        <div style="position:absolute;bottom:0;left:0;right:0;height:10px;background:${theme.accent}"></div>
      </div>
      <span class="swatch-name">${theme.name}</span>`;
    btn.addEventListener('click', () => {
      currentTheme    = theme;
      customPrimary   = null;
      customSecondary = null;
      applyTheme(); // also calls updateOverlay()
      saveSettings();
      renderThemeSwatches();
      colorPrimary.value   = theme.accent;
      colorSecondary.value = theme.bg;
      syncStarsToggle();
    });
    themeGrid.appendChild(btn);
  });
}

function syncStarsToggle() {
  starsToggleRow.classList.toggle('disabled', !isDarkTheme());
}

function openSettings() {
  colorPrimary.value    = customPrimary   || currentTheme.accent;
  colorSecondary.value  = customSecondary || currentTheme.bg;
  toggleGradient.checked = gradientEnabled;
  toggleStars.checked    = starsEnabled;
  syncStarsToggle();
  renderThemeSwatches();
  settingsPanel.classList.remove('hidden');
}

function closeSettings() {
  settingsPanel.classList.add('hidden');
}

// ── Helpers ──
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function activeNote() {
  return notes.find(n => n.id === activeId) || null;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Welcome helpers ──
function showWelcome() {
  welcomeEl.classList.remove('hidden', 'exit');
  welcomeEl.classList.add('fade-in');
  setTimeout(() => welcomeEl.classList.remove('fade-in'), 300);
}

function hideWelcome(callback) {
  welcomeEl.classList.add('exit');
  setTimeout(() => {
    welcomeEl.classList.add('hidden');
    welcomeEl.classList.remove('exit');
    callback?.();
  }, 420);
}

// ── Swipe helpers ──
function closeRevealedActions() {
  if (!revealedItem) return;
  const { content } = revealedItem;
  content.style.transition = 'transform 0.22s ease';
  content.style.transform = 'translateX(0)';
  revealedItem = null;
}

function attachSwipeHandlers(li, content, noteId) {
  let startX = 0, startY = 0, isDragging = false, swipeDir = null;

  li.addEventListener('touchstart', e => {
    if (revealedItem && revealedItem.li !== li) closeRevealedActions();
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isDragging = false;
    swipeDir = null;
    li._hasSwiped = false;
    content.style.transition = 'none';
  }, { passive: true });

  li.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (!isDragging) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) return; // vertical scroll — ignore
      isDragging = true;
      swipeDir = dx > 0 ? 'right' : 'left';
      // Hide actions immediately when swiping left so they don't
      // peek out as the content slides off-screen
      if (swipeDir === 'left') {
        li.querySelector('.swipe-actions').style.visibility = 'hidden';
      }
    }

    const isRevealed = revealedItem?.li === li;
    const baseX = isRevealed ? REVEAL_WIDTH : 0;

    if (swipeDir === 'right') {
      const newX = Math.max(0, Math.min(REVEAL_WIDTH, baseX + dx));
      content.style.transform = `translateX(${newX}px)`;
    } else {
      if (isRevealed) {
        // Swiping left from revealed state closes the actions
        content.style.transform = `translateX(${Math.max(0, REVEAL_WIDTH + dx)}px)`;
      } else {
        content.style.transform = `translateX(${Math.max(-90, dx)}px)`;
      }
    }
  }, { passive: true });

  li.addEventListener('touchend', e => {
    const actions = li.querySelector('.swipe-actions');
    if (!isDragging) {
      actions.style.visibility = '';
      return;
    }
    const dx = e.changedTouches[0].clientX - startX;
    const isRevealed = revealedItem?.li === li;
    content.style.transition = 'transform 0.25s ease';

    if (swipeDir === 'right') {
      actions.style.visibility = '';
      if (dx > SWIPE_THRESHOLD) {
        content.style.transform = `translateX(${REVEAL_WIDTH}px)`;
        revealedItem = { li, content };
      } else if (isRevealed) {
        content.style.transform = `translateX(${REVEAL_WIDTH}px)`;
      } else {
        content.style.transform = 'translateX(0)';
      }
    } else {
      if (isRevealed) {
        actions.style.visibility = '';
        if (dx < -SWIPE_THRESHOLD) {
          content.style.transform = 'translateX(0)';
          revealedItem = null;
        } else {
          content.style.transform = `translateX(${REVEAL_WIDTH}px)`;
        }
      } else if (dx < -SWIPE_THRESHOLD) {
        // Opening note — keep actions hidden; renderList will recreate the li
        li._hasSwiped = true;
        content.style.transform = 'translateX(-110%)';
        setTimeout(() => selectNote(noteId), 220);
      } else {
        actions.style.visibility = '';
        content.style.transform = 'translateX(0)';
      }
    }
  }, { passive: true });
}

// ── Render ──
function renderList() {
  const query = searchInput.value.toLowerCase();
  const filtered = notes
    .filter(n =>
      n.title.toLowerCase().includes(query) ||
      n.body.toLowerCase().includes(query)
    )
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updatedAt - a.updatedAt;
    });

  noteList.innerHTML = '';
  filtered.forEach(n => {
    const li = document.createElement('li');
    if (n.id === activeId) li.classList.add('active');

    li.innerHTML = `
      <div class="swipe-actions">
        <button class="action-btn action-pin">${n.pinned ? 'Unpin' : 'Pin'}</button>
        <button class="action-btn action-delete">Delete</button>
      </div>
      <div class="note-item-content">
        <div class="note-item-title">${escapeHtml(n.title) || 'Untitled'}${n.pinned ? '<span class="pin-badge">pinned</span>' : ''}</div>
        <div class="note-item-preview">${escapeHtml(n.body.slice(0, 60).replace(/\n/g, ' '))}</div>
        <div class="note-item-date">${formatDate(n.updatedAt)}</div>
      </div>
    `;

    const content = li.querySelector('.note-item-content');

    content.addEventListener('click', () => {
      if (li._hasSwiped) { li._hasSwiped = false; return; }
      if (revealedItem?.li === li) { closeRevealedActions(); return; }
      selectNote(n.id);
    });

    li.querySelector('.action-pin').addEventListener('click', e => {
      e.stopPropagation();
      pinNote(n.id);
    });

    li.querySelector('.action-delete').addEventListener('click', e => {
      e.stopPropagation();
      deleteNoteById(n.id, li);
    });

    attachSwipeHandlers(li, content, n.id);
    noteList.appendChild(li);
  });
}

function renderEditor() {
  const note = activeNote();
  const hasNote = !!note;

  noteTitle.disabled  = !hasNote;
  noteBody.disabled   = !hasNote;
  deleteBtn.disabled  = !hasNote;
  emptyState.classList.toggle('hidden', hasNote);

  if (note) {
    noteTitle.value = note.title;
    noteBody.value  = note.body;
    lastSaved.textContent = `Saved ${formatDate(note.updatedAt)}`;
  } else {
    noteTitle.value = '';
    noteBody.value  = '';
    lastSaved.textContent = '';
  }
}

// ── Actions ──
function selectNote(id) {
  activeId = id;
  renderEditor();               // populate editor while still off-screen
  appEl.classList.add('show-editor'); // start the slide-in
  // Delay list re-render until the sidebar has fully slid off-screen (transition is 250ms).
  // Calling renderList() immediately destroys the mid-animation note item and replaces it
  // with a fresh one at translateX(0), causing a visible snap-back before the sidebar exits.
  setTimeout(() => renderList(), 260);
  if (window.innerWidth > 640) noteBody.focus();
}

function createNote() {
  const note = { id: uid(), title: '', body: '', pinned: false, updatedAt: Date.now() };
  notes.unshift(note);
  save();
  selectNote(note.id);
  // Delay focus on mobile so the keyboard doesn't pop mid-slide animation
  if (window.innerWidth > 640) noteTitle.focus();
  else setTimeout(() => noteTitle.focus(), 280);
}

function pinNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;
  note.pinned = !note.pinned;
  save();
  closeRevealedActions();
  renderList();
}

// Delete from swipe action — no confirm needed (gesture is intentional)
function deleteNoteById(id, li) {
  const h = li.offsetHeight;
  li.style.overflow = 'hidden';
  li.style.maxHeight = h + 'px';
  li.style.transition = 'opacity 0.18s ease, max-height 0.28s ease 0.1s, margin-bottom 0.28s ease 0.1s';
  li.style.opacity = '0';
  requestAnimationFrame(() => {
    li.style.maxHeight = '0';
    li.style.marginBottom = '0';
  });
  setTimeout(() => {
    notes = notes.filter(n => n.id !== id);
    if (activeId === id) {
      activeId = notes.length ? notes[0].id : null;
      appEl.classList.remove('show-editor');
      renderEditor();
    }
    revealedItem = null;
    save();
    renderList();
    if (notes.length === 0) showWelcome();
  }, 420);
}

// Delete from editor header — keep confirm dialog
function deleteNote() {
  if (!activeId) return;
  if (!confirm('Delete this note?')) return;
  notes = notes.filter(n => n.id !== activeId);
  activeId = notes.length ? notes[0].id : null;
  appEl.classList.remove('show-editor');
  save();
  renderList();
  renderEditor();
  if (notes.length === 0) showWelcome();
}

function scheduleAutosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const note = activeNote();
    if (!note) return;
    note.title     = noteTitle.value;
    note.body      = noteBody.value;
    note.updatedAt = Date.now();
    save();
    lastSaved.textContent = `Saved ${formatDate(note.updatedAt)}`;
    renderList();
  }, 400);
}

// ── Events ──
document.getElementById('start-btn').addEventListener('click', () => {
  hideWelcome(() => createNote());
});

backBtn.addEventListener('click', () => {
  appEl.classList.remove('show-editor');
});
newNoteBtn.addEventListener('click', createNote);
newNoteFab.addEventListener('click', createNote);
deleteBtn.addEventListener('click', deleteNote);

settingsBtn.addEventListener('click', openSettings);
settingsCloseBtn.addEventListener('click', closeSettings);
settingsPanel.addEventListener('click', e => { if (e.target === settingsPanel) closeSettings(); });

colorPrimary.addEventListener('input', () => {
  customPrimary = colorPrimary.value;
  document.documentElement.style.setProperty('--accent', customPrimary);
  updateOverlay(); // light-mode gradient uses accent
  saveSettings();
});
colorSecondary.addEventListener('input', () => {
  customSecondary = colorSecondary.value;
  document.documentElement.style.setProperty('--bg', customSecondary);
  updateOverlay(); // dark/light detection uses bg
  syncStarsToggle();
  saveSettings();
});

toggleGradient.addEventListener('change', () => {
  gradientEnabled = toggleGradient.checked;
  updateOverlay();
  saveSettings();
});
toggleStars.addEventListener('change', () => {
  starsEnabled = toggleStars.checked;
  updateOverlay();
  saveSettings();
});

window.addEventListener('resize', () => {
  if (gradientEnabled && starsEnabled && isDarkTheme()) {
    starsCanvas.width  = skyOverlay.offsetWidth;
    starsCanvas.height = skyOverlay.offsetHeight;
    drawStars(starsCanvas);
  }
});
noteTitle.addEventListener('input', scheduleAutosave);
noteBody.addEventListener('input', scheduleAutosave);
searchInput.addEventListener('input', renderList);

// Close revealed actions on list scroll or tap outside
noteList.addEventListener('scroll', closeRevealedActions, { passive: true });
document.addEventListener('touchstart', e => {
  if (revealedItem && !e.target.closest('#note-list')) closeRevealedActions();
}, { passive: true });

// Keyboard shortcut: Cmd/Ctrl+N = new note
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
    e.preventDefault();
    createNote();
  }
});

// ── Init ──
loadSettings();
applyTheme();
load();
if (notes.length) {
  welcomeEl.classList.add('hidden');
  activeId = notes[0].id;
}
renderList();
renderEditor();

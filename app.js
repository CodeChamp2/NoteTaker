const STORAGE_KEY = 'notetaker_notes';
const REVEAL_WIDTH = 140;
const SWIPE_THRESHOLD = 55;

let notes = [];
let activeId = null;
let saveTimer = null;
let revealedItem = null; // { li, content }

// ── DOM refs ──
const noteList    = document.getElementById('note-list');
const newNoteBtn  = document.getElementById('new-note-btn');
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
    // Always restore actions visibility (was hidden during left swipe)
    li.querySelector('.swipe-actions').style.visibility = '';
    if (!isDragging) return;
    const dx = e.changedTouches[0].clientX - startX;
    const isRevealed = revealedItem?.li === li;
    content.style.transition = 'transform 0.25s ease';

    if (swipeDir === 'right') {
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
        if (dx < -SWIPE_THRESHOLD) {
          content.style.transform = 'translateX(0)';
          revealedItem = null;
        } else {
          content.style.transform = `translateX(${REVEAL_WIDTH}px)`;
        }
      } else if (dx < -SWIPE_THRESHOLD) {
        li._hasSwiped = true;
        content.style.transform = 'translateX(-110%)';
        setTimeout(() => selectNote(noteId), 220);
      } else {
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
  appEl.classList.add('show-editor');
  renderList();
  renderEditor();
  noteBody.focus();
}

function createNote() {
  const note = { id: uid(), title: '', body: '', pinned: false, updatedAt: Date.now() };
  notes.unshift(note);
  save();
  selectNote(note.id);
  noteTitle.focus();
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
deleteBtn.addEventListener('click', deleteNote);
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
load();
if (notes.length) {
  welcomeEl.classList.add('hidden');
  activeId = notes[0].id;
}
renderList();
renderEditor();

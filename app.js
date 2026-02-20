const STORAGE_KEY = 'notetaker_notes';

let notes = [];
let activeId = null;
let saveTimer = null;

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

// ── Render ──
function renderList() {
  const query = searchInput.value.toLowerCase();
  const filtered = notes
    .filter(n =>
      n.title.toLowerCase().includes(query) ||
      n.body.toLowerCase().includes(query)
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);

  noteList.innerHTML = '';
  filtered.forEach(n => {
    const li = document.createElement('li');
    if (n.id === activeId) li.classList.add('active');
    li.innerHTML = `
      <div class="note-item-title">${escapeHtml(n.title) || 'Untitled'}</div>
      <div class="note-item-preview">${escapeHtml(n.body.slice(0, 60).replace(/\n/g, ' '))}</div>
      <div class="note-item-date">${formatDate(n.updatedAt)}</div>
    `;
    li.addEventListener('click', () => selectNote(n.id));
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

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
  const note = { id: uid(), title: '', body: '', updatedAt: Date.now() };
  notes.unshift(note);
  save();
  selectNote(note.id);
  noteTitle.focus();
}

function deleteNote() {
  if (!activeId) return;
  const confirmed = confirm('Delete this note?');
  if (!confirmed) return;
  notes = notes.filter(n => n.id !== activeId);
  activeId = notes.length ? notes[0].id : null;
  appEl.classList.remove('show-editor');
  save();
  renderList();
  renderEditor();
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
backBtn.addEventListener('click', () => {
  appEl.classList.remove('show-editor');
});
newNoteBtn.addEventListener('click', createNote);
deleteBtn.addEventListener('click', deleteNote);
noteTitle.addEventListener('input', scheduleAutosave);
noteBody.addEventListener('input', scheduleAutosave);
searchInput.addEventListener('input', renderList);

// Keyboard shortcut: Cmd/Ctrl+N = new note
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
    e.preventDefault();
    createNote();
  }
});

// ── Init ──
load();
if (notes.length) activeId = notes[0].id;
renderList();
renderEditor();

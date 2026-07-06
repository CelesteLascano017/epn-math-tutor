/**
 * TutorMath V1 — Frontend Application
 *
 * Architecture:
 *  1. Constants
 *  2. In-memory state
 *  3. DOM refs
 *  4. UI state machine
 *  5. sendQuestion() — routing rule
 *  6. First-turn lifecycle
 *  7. Later-turn lifecycle
 *  8. Conversation switching
 *  9. Title helpers
 * 10. Renderers (renderTutorGroup, renderBlock, renderUserBubble)
 * 11. History management (addHistoryItem, setActiveHistory)
 * 12. Textarea utilities
 * 13. Event listeners
 * 14. Init
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Constants
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = 'http://localhost:8000/ask';

/** Maximum characters displayed in a sidebar history item label. */
const SIDEBAR_TITLE_MAX = 28;

/** Maximum textarea height in pixels before it starts scrolling. */
const MAX_TEXTAREA_HEIGHT = 200;

/**
 * KaTeX auto-render options.
 * Only renders when the model outputs one of these supported delimiter pairs.
 * Plain text without delimiters is preserved safely.
 */
const KATEX_OPTIONS = {
  delimiters: [
    { left: '$$', right: '$$', display: true  },
    { left: '$',  right: '$',  display: false },
    { left: '\\(', right: '\\)', display: false },
    { left: '\\[', right: '\\]', display: true  },
  ],
  throwOnError: false, // gracefully skip unrecognized expressions
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. In-memory state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Application state — lives only in this browser session.
 * Refreshing the page clears all history (by design for V1).
 *
 * Conversation object shape:
 *   {
 *     id:       Number,   // Date.now() at creation
 *     title:    String,   // full provisional title (trimmed first question)
 *     messages: Array     // ordered turns:
 *       { role: 'user',  content: String }
 *       { role: 'tutor', blocks: Array<{ type, content }> }
 *   }
 */
const state = {
  /** 'empty' | 'loading' | 'conversation' */
  uiMode: 'empty',

  /** All conversations created this session, ordered by creation time. */
  conversations: [],

  /**
   * ID of the currently displayed conversation, or null when no conversation
   * is active (empty state, or after a failed first request).
   * This value is the ONLY thing that determines which lifecycle sendQuestion()
   * uses: null → first-turn, non-null → later-turn.
   */
  activeConvId: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. DOM refs
// ─────────────────────────────────────────────────────────────────────────────

const elApp          = document.getElementById('app');
const elEmptyState   = document.getElementById('empty-state');
const elConversation = document.getElementById('conversation');
const elConvTitle    = document.getElementById('conv-title');
const elChatArea     = document.getElementById('chat-area');
const elHistoryList  = document.getElementById('history-list');

const elInputEmpty   = document.getElementById('input-empty');
const elSendEmpty    = document.getElementById('send-empty');

const elInputConv    = document.getElementById('input-conv');
const elSendConv     = document.getElementById('send-conv');

const elNewChatBtn   = document.getElementById('new-chat-btn');

// ─────────────────────────────────────────────────────────────────────────────
// 4. UI state machine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transitions the UI between modes.
 * @param {'empty'|'loading'|'conversation'} mode
 */
function setMode(mode) {
  state.uiMode = mode;

  switch (mode) {
    case 'empty':
      elEmptyState.hidden   = false;
      elConversation.hidden = true;
      setComposerDisabled(false);
      break;

    case 'loading':
      elEmptyState.hidden   = true;
      elConversation.hidden = false;
      setComposerDisabled(true);
      break;

    case 'conversation':
      elEmptyState.hidden   = true;
      elConversation.hidden = false;
      setComposerDisabled(false);
      elInputConv.focus();
      break;
  }
}

/** Enables or disables both send buttons and textarea inputs. */
function setComposerDisabled(disabled) {
  elSendEmpty.disabled  = disabled;
  elSendConv.disabled   = disabled;
  elInputEmpty.disabled = disabled;
  elInputConv.disabled  = disabled;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. sendQuestion() — routing rule
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Single entry point for all sends. Lifecycle is determined exclusively by
 * state.activeConvId:
 *   null     → first-turn lifecycle (includes retry after a failed first request)
 *   non-null → later-turn lifecycle
 *
 * Do NOT check state.uiMode to decide which path to take.
 */
function sendQuestion(rawQuestion) {
  const question = rawQuestion.trim();
  if (!question) return;

  // Clear whichever textarea is visible
  clearActiveTextarea();

  if (state.activeConvId === null) {
    runFirstTurn(question);
  } else {
    runLaterTurn(question);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. First-turn lifecycle
// Used whenever state.activeConvId === null (new session or after failed first
// request — the retry is treated as a fresh first-turn attempt).
// ─────────────────────────────────────────────────────────────────────────────

async function runFirstTurn(question) {
  // 1. Transition to loading layout
  setMode('loading');

  // 2. Render the user bubble immediately
  elChatArea.appendChild(renderUserBubble(question));

  // 3. Show loading indicator
  const dots = renderLoadingDots();
  elChatArea.appendChild(dots);
  scrollToBottom();

  // 4. Call the API
  let data;
  try {
    data = await postAsk(question);
  } catch (err) {
    // ── FAILURE ──────────────────────────────────────────────────────────────
    dots.remove();

    // Do NOT create a conversation object or history item.
    // state.activeConvId remains null — the next send will also be first-turn.
    elChatArea.appendChild(renderErrorBlock());
    setMode('conversation'); // keep conversation view so user sees the error
    scrollToBottom();
    return;
  }

  // ── SUCCESS ───────────────────────────────────────────────────────────────
  dots.remove();

  // Derive and store the full provisional title (no truncation here)
  const title = deriveTitle(question);

  // Create the conversation object
  const conv = {
    id: Date.now(),
    title,
    messages: [],
  };
  conv.messages.push({ role: 'user',  content: question });
  conv.messages.push({ role: 'tutor', blocks: data.blocks });

  // Register in state
  state.conversations.push(conv);
  state.activeConvId = conv.id;

  // Update the conversation title header (full, untruncated)
  elConvTitle.textContent = conv.title;

  // Render the tutor response
  elChatArea.appendChild(renderTutorGroup(data.blocks));

  // Add to sidebar history (newest at top) — only now, after success
  addHistoryItem(conv);

  setMode('conversation');
  scrollToBottom();
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Later-turn lifecycle
// Used whenever state.activeConvId !== null.
// ─────────────────────────────────────────────────────────────────────────────

async function runLaterTurn(question) {
  // Look up the active conversation
  const conv = state.conversations.find(c => c.id === state.activeConvId);
  if (!conv) return; // should not happen, but guard anyway

  // Store user message immediately
  conv.messages.push({ role: 'user', content: question });

  // Render the user bubble
  elChatArea.appendChild(renderUserBubble(question));

  // Show loading indicator
  const dots = renderLoadingDots();
  elChatArea.appendChild(dots);
  setComposerDisabled(true);
  scrollToBottom();

  // Call the API
  let data;
  try {
    data = await postAsk(question);
  } catch (err) {
    // ── FAILURE ──────────────────────────────────────────────────────────────
    dots.remove();
    // User message is already stored; failed tutor turn is not stored.
    elChatArea.appendChild(renderErrorBlock());
    setComposerDisabled(false);
    scrollToBottom();
    return;
  }

  // ── SUCCESS ───────────────────────────────────────────────────────────────
  dots.remove();
  conv.messages.push({ role: 'tutor', blocks: data.blocks });
  elChatArea.appendChild(renderTutorGroup(data.blocks));
  setComposerDisabled(false);
  scrollToBottom();
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Conversation switching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Switches the main panel to display a stored conversation.
 * Reconstructs all messages from conv.messages in order.
 */
function switchToConversation(id) {
  if (id === state.activeConvId) return; // already active

  const conv = state.conversations.find(c => c.id === id);
  if (!conv) return;

  // Update state
  state.activeConvId = conv.id;

  // Clear and reconstruct chat area
  elChatArea.innerHTML = '';
  for (const msg of conv.messages) {
    if (msg.role === 'user') {
      elChatArea.appendChild(renderUserBubble(msg.content));
    } else if (msg.role === 'tutor') {
      elChatArea.appendChild(renderTutorGroup(msg.blocks)); // re-runs KaTeX
    }
  }

  // Update header title with full untruncated title
  elConvTitle.textContent = conv.title;

  // Highlight active sidebar item
  setActiveHistory(conv.id);

  setMode('conversation');
  scrollToBottom();
}

/**
 * Starts a fresh empty session.
 * Previous conversations remain in state.conversations — they are not deleted.
 */
function startNewChat() {
  state.activeConvId = null;
  elChatArea.innerHTML = '';
  elConvTitle.textContent = '';
  resetTextarea(elInputEmpty);
  resetTextarea(elInputConv);
  setActiveHistory(null); // deselect all history items
  setMode('empty');
  elInputEmpty.focus();
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Title helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produces the full provisional title for a conversation.
 * Stored in conv.title and displayed in #conv-title — never truncated here.
 * Not AI-generated; no additional API call.
 */
function deriveTitle(question) {
  return question.trim();
}

/**
 * Produces the sidebar display label for a conversation title.
 * Applies SIDEBAR_TITLE_MAX truncation only for the sidebar item.
 */
function truncateTitle(title) {
  if (title.length <= SIDEBAR_TITLE_MAX) return title;
  return title.slice(0, SIDEBAR_TITLE_MAX).trimEnd() + '\u2026'; // …
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Renderers
// ─────────────────────────────────────────────────────────────────────────────

/** Creates a right-aligned user bubble element. */
function renderUserBubble(content) {
  const el = document.createElement('div');
  el.className = 'user-bubble';
  el.textContent = content;
  return el;
}

/**
 * Creates a tutor response group containing one block element per block,
 * in the order returned by the API.
 */
function renderTutorGroup(blocks) {
  const group = document.createElement('div');
  group.className = 'tutor-group';
  for (const block of blocks) {
    group.appendChild(renderBlock(block));
  }
  return group;
}

/**
 * Renders a single content block based on its type.
 *
 * XSS safety: block.content is always assigned via textContent, never innerHTML.
 * KaTeX auto-render is called after the text node is in the DOM — KaTeX itself
 * produces safe output. No regex conversion of plain text is attempted.
 *
 * KaTeX V1 limitation: only renders expressions wrapped in supported delimiter
 * pairs ($, $$, \(...\), \[...\]). Text without delimiters is preserved as-is.
 */
function renderBlock(block) {
  switch (block.type) {
    case 'explanation':
      return renderExplanationBlock(block.content);

    case 'definition':
      return renderDefinitionBlock(block.content);

    case 'formal_solution':
      return renderFormalSolutionBlock(block.content);

    default:
      // Unknown block type — render as plain explanation text
      return renderExplanationBlock(block.content);
  }
}

function renderExplanationBlock(content) {
  const el = document.createElement('div');
  el.className = 'block-explanation';
  el.textContent = content;
  runKaTeX(el);
  return el;
}

function renderDefinitionBlock(content) {
  const el = document.createElement('div');
  el.className = 'block-definition';

  const label = document.createElement('span');
  label.className = 'block-label';
  label.textContent = 'Definición'; // Fixed label — never inferred from content

  const body = document.createElement('div');
  body.className = 'block-body';
  body.textContent = content;

  el.appendChild(label);
  el.appendChild(body);
  runKaTeX(el);
  return el;
}

function renderFormalSolutionBlock(content) {
  const el = document.createElement('div');
  el.className = 'block-formal-solution';

  const heading = document.createElement('div');
  heading.className = 'solution-heading';
  // Fixed heading in V1. A future version may add a structured 'heading'
  // field to the schema to support 'SOLUCIÓN', 'JUSTIFICACIÓN', etc.
  heading.textContent = 'Demostración';

  const body = document.createElement('div');
  body.className = 'block-body';
  body.textContent = content;

  el.appendChild(heading);
  el.appendChild(body);
  runKaTeX(el);
  return el;
}

/** Renders a friendly Spanish error block. */
function renderErrorBlock() {
  const el = document.createElement('div');
  el.className = 'block-error';
  el.textContent =
    'No pude conectarme al tutor en este momento. ' +
    'Por favor, verifica que el servidor esté funcionando e intenta de nuevo.';
  return el;
}

/** Creates the three-dot loading indicator. */
function renderLoadingDots() {
  const wrap = document.createElement('div');
  wrap.className = 'loading-dots';
  for (let i = 0; i < 3; i++) {
    wrap.appendChild(document.createElement('span'));
  }
  return wrap;
}

/**
 * Runs KaTeX auto-render on an element.
 * Only processes text nodes that contain one of the supported delimiter pairs.
 * Plain text without delimiters is left untouched.
 */
function runKaTeX(el) {
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(el, KATEX_OPTIONS);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. History management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a sidebar history item for the given conversation and prepends it
 * to #history-list (newest created conversation at the top).
 *
 * Ordering rule (V1): ordered by creation time only. Continuing or reopening
 * an existing conversation does NOT move it to the top. No updatedAt or
 * reordering logic is applied.
 */
function addHistoryItem(conv) {
  const item = document.createElement('div');
  item.className = 'history-item';
  item.dataset.convId = conv.id;
  // Sidebar label uses the truncated version; conv.title remains full
  item.textContent = truncateTitle(conv.title);
  item.title = conv.title; // tooltip shows full title on hover

  // Prepend: newest at top
  elHistoryList.prepend(item);

  setActiveHistory(conv.id);
}

/**
 * Marks one history item as active (highlighted).
 * @param {number|null} id — conversation id, or null to deselect all
 */
function setActiveHistory(id) {
  for (const item of elHistoryList.querySelectorAll('.history-item')) {
    item.classList.toggle('active', Number(item.dataset.convId) === id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. Textarea utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Auto-resizes a textarea to fit its content, up to MAX_TEXTAREA_HEIGHT. */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT) + 'px';
}

/** Resets a textarea to its initial single-row state. */
function resetTextarea(el) {
  el.value = '';
  el.style.height = 'auto';
}

/** Attaches auto-resize behaviour to a textarea element. */
function attachAutoResize(el) {
  el.addEventListener('input', () => autoResize(el));
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. API layer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Posts a question to the backend.
 * Throws on network errors or non-OK HTTP responses.
 * Returns the parsed TutorResponse JSON on success.
 */
async function postAsk(question) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function scrollToBottom() {
  elChatArea.scrollTop = elChatArea.scrollHeight;
}

/** Returns the text value of whichever textarea is currently visible. */
function getActiveInputValue() {
  return state.uiMode === 'empty' ? elInputEmpty.value : elInputConv.value;
}

/** Clears whichever textarea is currently visible. */
function clearActiveTextarea() {
  if (state.uiMode === 'empty') {
    resetTextarea(elInputEmpty);
  } else {
    resetTextarea(elInputConv);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. Event listeners
// ─────────────────────────────────────────────────────────────────────────────

// ── Send buttons ──────────────────────────────────────────────────────────────
elSendEmpty.addEventListener('click', () => sendQuestion(elInputEmpty.value));
elSendConv.addEventListener('click',  () => sendQuestion(elInputConv.value));

// ── Keyboard: Ctrl+Enter / Cmd+Enter sends; Enter alone inserts newline ───────
function handleKeydown(textarea) {
  return function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendQuestion(textarea.value);
    }
    // plain Enter → default newline behaviour (no special handling needed)
  };
}

elInputEmpty.addEventListener('keydown', handleKeydown(elInputEmpty));
elInputConv.addEventListener('keydown',  handleKeydown(elInputConv));

// ── Auto-resize both textareas ────────────────────────────────────────────────
attachAutoResize(elInputEmpty);
attachAutoResize(elInputConv);

// ── Nuevo chat ────────────────────────────────────────────────────────────────
elNewChatBtn.addEventListener('click', startNewChat);

// ── History list — event delegation ──────────────────────────────────────────
// The .brand-icon-right span intentionally has NO event listener.
elHistoryList.addEventListener('click', (e) => {
  const item = e.target.closest('.history-item');
  if (!item) return;
  const id = Number(item.dataset.convId);
  if (id) switchToConversation(id);
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. Init
// ─────────────────────────────────────────────────────────────────────────────

(function init() {
  setMode('empty');
  elInputEmpty.focus();
})();

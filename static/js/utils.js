// Shared utility functions used by both hub and spoke modules.

/**
 * Escape a value for safe HTML insertion.
 * Handles null/undefined gracefully.
 */
export function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Show an inline success/error message on a status element.
 * Automatically hides after `timeout` ms (pass 0 to keep visible).
 */
export function showInlineMessage(element, text, isError, timeout = 5000) {
  if (!element) return;
  clearTimeout(element._timer);
  if (!text) {
    element.textContent = '';
    element.className = 'settings-message hidden';
    return;
  }
  element.textContent = text;
  element.className = `settings-message ${isError ? 'error' : 'success'}`;
  if (timeout > 0) {
    element._timer = setTimeout(() => {
      element.className = 'settings-message hidden';
    }, timeout);
  }
}

/**
 * Defensive wrappers around WebView localStorage. A storage/profile problem
 * must not prevent the editor from opening or working for the current session.
 */
function getStorage() {
  try { return typeof globalThis !== 'undefined' ? globalThis.localStorage || null : null; }
  catch { return null; }
}
export function safeStorageGet(key, fallback = null) {
  try { return getStorage()?.getItem(String(key)) ?? fallback; }
  catch { return fallback; }
}
export function safeStorageSet(key, value) {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(String(key), String(value));
    return true;
  } catch { return false; }
}
export function safeStorageRemove(key) {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.removeItem(String(key));
    return true;
  } catch { return false; }
}

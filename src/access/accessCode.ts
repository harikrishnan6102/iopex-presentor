/**
 * Static access code for the kiosk.
 *
 * This is a door, not a lock. The code is compiled into the bundle (or set on
 * window), so anyone who opens devtools can read it. What it buys is that a
 * link passed around does not become a live ElevenLabs session for whoever
 * clicks it — which is the actual bill. Real limits belong on the agent:
 * allowed origins, a conversation cap and a per-conversation duration cap.
 *
 * Resolution order mirrors the agent id: ?code=… in the URL (unlocks, then the
 * parameter is stripped) → window.IOPEX_ACCESS_CODE → VITE_ACCESS_CODE.
 * With no code configured anywhere there is no gate at all, so dev and CI are
 * untouched.
 */

const STORAGE_KEY = 'iopex.access';

/** The code this build expects, or '' when the kiosk is meant to be open. */
export function requiredCode(): string {
  return String(window.IOPEX_ACCESS_CODE || import.meta.env.VITE_ACCESS_CODE || '').trim();
}

function normalise(v: string): string {
  return String(v || '').trim().toLowerCase();
}

/**
 * djb2. Not a security measure — it exists so the stored unlock changes when
 * the code changes, and so the code itself is not sitting in localStorage for
 * the next person to read off the kiosk.
 */
function token(code: string): string {
  let h = 5381;
  for (let i = 0; i < code.length; i++) h = (((h << 5) + h) ^ code.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function read(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export function isUnlocked(): boolean {
  const code = requiredCode();
  if (!code) return true;
  return read() === token(normalise(code));
}

/** Returns whether the entered code was right; remembers it if so. */
export function tryUnlock(entered: string): boolean {
  const code = requiredCode();
  if (!code) return true;
  if (!normalise(entered) || normalise(entered) !== normalise(code)) return false;
  try { localStorage.setItem(STORAGE_KEY, token(normalise(code))); } catch { /* private mode: unlocked for this load only */ }
  return true;
}

/** Forget the unlock — the next load asks again. */
export function lock(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

/**
 * `?code=1234` unlocks without typing (for a kiosk that boots into a URL), and
 * `?lock` locks again. Both are stripped from the address bar afterwards so the
 * code is not left on screen, or in the next screenshot.
 */
export function consumeUrlParams(): void {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const wantsLock = params.has('lock');
  if (code === null && !wantsLock) return;

  if (wantsLock) lock();
  if (code !== null) tryUnlock(code);

  params.delete('code');
  params.delete('lock');
  const qs = params.toString();
  history.replaceState(history.state, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
}

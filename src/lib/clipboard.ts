/**
 * Copy text to the clipboard, preferring the async Clipboard API and falling
 * back to the hidden-textarea + execCommand trick for older Android System
 * WebViews (where navigator.clipboard needs a secure context / recent build).
 * Resolves true only when a copy path reported success.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard API refused (permissions/insecure context) — try the fallback.
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

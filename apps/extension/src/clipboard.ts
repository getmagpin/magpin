/**
 * Writes text to the clipboard from an extension page. The async Clipboard API
 * needs a focused document; the execCommand path covers the rare case where the
 * side panel lost focus (allowed by the clipboardWrite permission).
 */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // fall through
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('Clipboard is not available');
}

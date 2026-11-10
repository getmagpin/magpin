/**
 * The extension's own icon (the magpie's head, as a sticker), next to the
 * name in the headers. The full bird only appears in the animations.
 */
export function AppIcon({ size }: { size: number }) {
  return <img class="app-icon" src="/icon/96.png" width={size} height={size} alt="" draggable={false} />;
}

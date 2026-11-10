import { type SourceId, SOURCE_NAMES, sourceIconSvg } from '@magpin/core';

interface SourceIconProps {
  source: SourceId;
  /** Rendered size in px. */
  size?: number;
  /** Next to the source's name already: hidden from screen readers, so it isn't read twice. */
  decorative?: boolean;
}

/** Monochrome mark of a source (Pinterest, Are.na, Cosmos, Savee). */
export function SourceIcon({ source, size = 16, decorative = false }: SourceIconProps) {
  return (
    <span
      class="mp-source-icon"
      {...(decorative ? { 'aria-hidden': 'true' as const } : { role: 'img', 'aria-label': SOURCE_NAMES[source] })}
      style={{ width: `${size}px`, height: `${size}px` }}
      // Static, trusted markup from @magpin/core.
      dangerouslySetInnerHTML={{ __html: sourceIconSvg(source, { size }) }}
    />
  );
}

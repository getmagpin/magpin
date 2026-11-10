import { describe, expect, it } from 'vitest';
import { SOURCE_IDS, SOURCE_NAMES, sourceIconSvg } from '../src';

describe('source marks', () => {
  it('has a mark and a name for every source', () => {
    for (const source of SOURCE_IDS) {
      const svg = sourceIconSvg(source, { size: 20, fg: '#111111', bg: '#EEEEEE' });
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="20" height="20" viewBox="[\d. ]+">/);
      expect(svg).toContain('#111111');
      expect(svg).not.toContain('{fg}');
      expect(svg).not.toContain('{bg}');
      expect(SOURCE_NAMES[source]).toBeTruthy();
    }
    expect(sourceIconSvg('savee')).toContain('#FFFFFF');
  });
});

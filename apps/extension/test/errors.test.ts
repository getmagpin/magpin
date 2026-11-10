import { afterEach, describe, expect, it, vi } from 'vitest';
import { friendlyError } from '../src/errors';

describe('friendlyError', () => {
  afterEach(() => vi.restoreAllMocks());

  it('turns raw Chrome and fetch messages into plain words, and logs the raw one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(friendlyError(new Error('Frame with ID 0 is showing error page'), 'x')).toMatch(/can't reach this page/);
    expect(friendlyError(new TypeError('Failed to fetch'), 'x')).toMatch(/connection dropped/);
    expect(friendlyError('Are.na answered 502.', 'x')).toMatch(/isn't answering/);
    expect(friendlyError(new DOMException('QuotaExceededError'), 'x')).toMatch(/disk space/);
    expect(warn).toHaveBeenCalledWith('[magpin]', 'Frame with ID 0 is showing error page');
  });

  it('falls back to the given words for anything else', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(friendlyError(new Error('Something odd'), 'Reload the board, then try again.')).toBe('Reload the board, then try again.');
  });
});

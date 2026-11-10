/**
 * Pinterest adapter. Board pages only render the pins near the viewport, so
 * the shared collector scrolls the page and reads cells as they appear.
 */
import { scrollCollect } from '../scroll';
import type { SourceAdapter } from '../types';
import { boardGridItems, findBoardList, getPinterestBoardMeta, readGridItem } from './dom';
import { matchPinterestBoard } from './match';
import { PINTEREST_SELECTORS } from './selectors';

export const pinterestDescriptor = {
  id: 'pinterest',
  label: 'Pinterest',
  itemNoun: 'pin',
  match: matchPinterestBoard,
} as const;

export const pinterestAdapter: SourceAdapter = {
  ...pinterestDescriptor,

  getBoardMeta(doc) {
    return getPinterestBoardMeta(doc, location.href);
  },

  collectItems(onProgress, signal) {
    const meta = getPinterestBoardMeta(document, location.href);
    return scrollCollect(
      {
        findList: findBoardList,
        listSelector: PINTEREST_SELECTORS.gridList,
        cells: (list) => boardGridItems(document, list),
        readCell: readGridItem,
        expectedCount: meta.expectedCount,
      },
      onProgress,
      signal,
    );
  },
};

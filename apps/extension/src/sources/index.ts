/**
 * Source registry. The side panel only uses descriptors (URL matching); the
 * content script uses full adapters. Delivery order: Pinterest, Are.na,
 * Cosmos, Savee.
 */
import type { SourceId } from '@magpin/core';
import { arenaDescriptor } from './arena/adapter';
import { cosmosDescriptor } from './cosmos/adapter';
import { pinterestDescriptor } from './pinterest/adapter';
import { saveeDescriptor } from './savee/adapter';
import type { SourceDescriptor } from './types';

export const SOURCES: readonly SourceDescriptor[] = [pinterestDescriptor, arenaDescriptor, cosmosDescriptor, saveeDescriptor];

export function findSource(url: string | undefined): SourceDescriptor | null {
  if (!url) return null;
  return SOURCES.find((source) => source.match(url)) ?? null;
}

export function sourceLabel(id: SourceId): string {
  return SOURCES.find((source) => source.id === id)?.label ?? id;
}

export function itemNoun(id: SourceId): string {
  return SOURCES.find((source) => source.id === id)?.itemNoun ?? 'item';
}

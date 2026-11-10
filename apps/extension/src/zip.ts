/**
 * ZIP export (F5). Images are downloaded from the extension page (host
 * permissions lift CORS there), streamed into client-zip and saved with
 * chrome.downloads. One folder per board, files `<index>-<id>.<ext>`.
 * A `magpin.json` manifest at the root lets the Figma plugin import the ZIP.
 */
import {
  type ExchangeBoard,
  createPayload,
  encodePayload,
  imageExtension,
  mapOrdered,
  uniqueFolderNames,
  zipEntryName,
  zipFileName,
} from '@magpin/core';
import { downloadZip } from 'client-zip';
import { type Browser, browser } from 'wxt/browser';
import { ZIP_CONCURRENCY } from './config';

export interface ZipProgress {
  done: number;
  total: number;
  failed: number;
}

export interface ZipResult {
  fileName: string;
  /** Images in the ZIP. When none could be downloaded, nothing is saved. */
  written: number;
  failed: number;
}

interface Job {
  folder: string;
  index: number;
  total: number;
  id: string;
  urls: string[];
}

type Fetched = { ok: true; job: Job; response: Response; ext: string } | { ok: false; job: Job };

export async function exportZip(
  boards: ExchangeBoard[],
  onProgress: (progress: ZipProgress) => void,
  signal: AbortSignal,
): Promise<ZipResult> {
  const folders = uniqueFolderNames(boards.map((board) => board.title));
  const jobs: Job[] = boards.flatMap((board, b) =>
    board.items.map((item, index) => ({
      folder: folders[b]!,
      index,
      total: board.items.length,
      id: item.id,
      urls: [item.imageUrl, item.fallbackUrl].filter((url): url is string => Boolean(url)),
    })),
  );

  const progress: ZipProgress = { done: 0, total: jobs.length, failed: 0 };
  onProgress({ ...progress });

  const fetchJob = async (job: Job): Promise<Fetched> => {
    for (const url of job.urls) {
      try {
        const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (response.ok) return { ok: true, job, response, ext: imageExtension(response.headers.get('content-type'), url) };
      } catch (error) {
        if (signal.aborted) throw error;
      }
    }
    return { ok: false, job };
  };

  async function* entries() {
    yield {
      name: 'magpin.json',
      input: encodePayload(createPayload(boards)),
      lastModified: new Date(),
    };
    for await (const result of mapOrdered(jobs, ZIP_CONCURRENCY, fetchJob, signal)) {
      progress.done++;
      if (result.ok) {
        const { job } = result;
        yield {
          name: `${job.folder}/${zipEntryName(job.index, job.total, job.id, result.ext)}`,
          input: result.response,
        };
      } else {
        progress.failed++;
      }
      onProgress({ ...progress });
    }
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  }

  // Chrome keeps large blobs on disk, so memory stays flat on big boards.
  const blob = await downloadZip(entries()).blob();
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');

  const fileName = zipFileName(boards.map((board) => board.title));
  const written = progress.done - progress.failed;
  // A ZIP holding only magpin.json is no use to anyone: don't save it.
  if (written > 0) await saveBlob(blob, fileName);
  return { fileName, written, failed: progress.failed };
}

async function saveBlob(blob: Blob, fileName: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    const downloadId = await browser.downloads.download({ url, filename: fileName, conflictAction: 'uniquify', saveAs: false });
    // Revoke the object URL once Chrome has finished writing the file.
    const onChanged = (delta: Browser.downloads.DownloadDelta) => {
      if (delta.id !== downloadId) return;
      const state = delta.state?.current;
      if (state === 'complete' || state === 'interrupted') {
        browser.downloads.onChanged.removeListener(onChanged);
        URL.revokeObjectURL(url);
      }
    };
    browser.downloads.onChanged.addListener(onChanged);
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

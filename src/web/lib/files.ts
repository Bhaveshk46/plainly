/**
 * Turn a chosen file into text, doing as much as possible on the device:
 * text and Word files never leave the browser; PDFs and photos are sent to the
 * server for text extraction (and AI reading of scans) and are not stored.
 */

import { normalizeDocument } from '../../shared/core/text.js';
import { DocxError, readDocxText } from '../../shared/docx.js';
import { api } from './api.js';
import { formatBytes } from './format.js';

export interface LoadedFile {
  text: string;
  /** True when the file had to be sent to the server (PDFs, images). */
  viaServer: boolean;
  truncated: boolean;
}

export interface LoadLimits {
  maxBytes: number;
  maxChars: number;
}

type Kind = 'docx' | 'pdf' | 'image' | 'text';

function sniff(head: Uint8Array): Kind {
  const starts = (...bytes: number[]): boolean => bytes.every((byte, index) => head[index] === byte);
  if (starts(0x50, 0x4b, 0x03, 0x04)) return 'docx';
  if (starts(0x25, 0x50, 0x44, 0x46)) return 'pdf';
  if (starts(0x89, 0x50, 0x4e, 0x47) || starts(0xff, 0xd8, 0xff) || starts(0x52, 0x49, 0x46, 0x46)) return 'image';
  return 'text';
}

function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

export async function loadFile(file: File, { maxBytes, maxChars }: LoadLimits, signal?: AbortSignal): Promise<LoadedFile> {
  if (file.size === 0) throw new Error('That file is empty.');
  if (file.size > maxBytes) throw new Error(`That file is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`);

  const kind = sniff(new Uint8Array(await file.slice(0, 8).arrayBuffer()));

  if (kind === 'pdf' || kind === 'image') {
    const result = await api.extract(file, signal);
    return { text: result.text, viaServer: true, truncated: result.truncated };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  let raw: string;
  try {
    raw = kind === 'docx' ? readDocxText(bytes) : decodeText(bytes);
  } catch (error) {
    if (error instanceof DocxError) throw new Error(error.message);
    throw error;
  }

  const text = normalizeDocument(raw);
  if (text.length < 40) throw new Error('No readable text was found in this file.');
  const truncated = text.length > maxChars;
  return { text: truncated ? text.slice(0, maxChars) : text, viaServer: false, truncated };
}

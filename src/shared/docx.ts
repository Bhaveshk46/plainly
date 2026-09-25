/**
 * Read the text of a .docx file. Runs in Node and in the browser (fflate is
 * isomorphic), so Word files can be read on the user's device without an upload.
 */

import { strFromU8, unzipSync } from 'fflate';

const MAX_XML_BYTES = 30 * 1024 * 1024;
const XML_ENTITIES: Readonly<Record<string, string>> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

export class DocxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocxError';
  }
}

/** Paragraph text from word/document.xml. Only that one entry is inflated, and only if it is a sane size. */
export function readDocxText(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (file) => file.name === 'word/document.xml' && file.originalSize <= MAX_XML_BYTES });
  } catch {
    throw new DocxError('This file is not a valid Word (.docx) document.');
  }
  const xml = files['word/document.xml'];
  if (!xml) throw new DocxError('This Word file has no readable text (or is too large).');

  return strFromU8(xml)
    .split('</w:p>')
    .map((paragraph) => [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)].map((run) => (run[1] !== undefined ? run[1] : '\t')).join(''))
    .join('\n')
    .replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity] ?? entity)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Math.min(Number(code), 0x10ffff)));
}

/**
 * Turn an uploaded file into text. The file type is decided from the bytes
 * (magic numbers), never from the filename or the client's MIME claim.
 *
 *   text / markdown -> UTF-8 (or UTF-16 with a byte-order mark)
 *   PDF             -> embedded text via pdf.js; scanned PDFs go to Gemini OCR
 *   DOCX            -> read word/document.xml from the zip, bounded in size
 *   PNG/JPEG/WebP   -> Gemini OCR (a photo of a notice or letter)
 */

import { extractText, getDocumentProxy } from 'unpdf';
import { normalizeDocument } from '../../shared/core/text.js';
import { DocxError, readDocxText } from '../../shared/docx.js';
import type { ExtractResult } from '../../shared/types.js';
import { LlmError, type LlmClient } from '../ai/gemini.js';
import { HttpError } from '../http/errors.js';

const MAX_PDF_PAGES = 150;
const PARSE_TIMEOUT_MS = 25_000;
const MIN_USEFUL_TEXT = 40;

export type FileKind = 'pdf' | 'docx' | 'image' | 'text' | 'unknown';

export interface SniffedType {
  kind: FileKind;
  mime: string;
  /** Text encoding, for `kind === 'text'`. */
  encoding?: 'utf-8' | 'utf-16le' | 'utf-16be';
}

export function sniffType(bytes: Uint8Array): SniffedType {
  const startsWith = (...signature: number[]): boolean => signature.every((byte, index) => bytes[index] === byte);
  if (startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return { kind: 'pdf', mime: 'application/pdf' };
  if (startsWith(0x50, 0x4b, 0x03, 0x04)) return { kind: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return { kind: 'image', mime: 'image/png' };
  if (startsWith(0xff, 0xd8, 0xff)) return { kind: 'image', mime: 'image/jpeg' };
  if (startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { kind: 'image', mime: 'image/webp' };
  }
  // Windows "Unicode" text files are UTF-16 and contain NUL bytes, so check the BOM first.
  if (startsWith(0xff, 0xfe)) return { kind: 'text', mime: 'text/plain', encoding: 'utf-16le' };
  if (startsWith(0xfe, 0xff)) return { kind: 'text', mime: 'text/plain', encoding: 'utf-16be' };
  if (!bytes.subarray(0, 4096).includes(0)) return { kind: 'text', mime: 'text/plain', encoding: 'utf-8' };
  return { kind: 'unknown', mime: 'application/octet-stream' };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HttpError(422, 'unreadable_file', 'Reading this file took too long. Try a smaller file or paste the text.')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function readPdf(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  if (pdf.numPages > MAX_PDF_PAGES) {
    throw new HttpError(413, 'too_many_pages', `This PDF has ${pdf.numPages} pages; the limit is ${MAX_PDF_PAGES}. Try uploading the relevant pages only.`);
  }
  const { text } = await extractText(pdf, { mergePages: true });
  return { text: Array.isArray(text) ? text.join('\n\n') : text, pages: pdf.numPages };
}

function readDocx(bytes: Uint8Array): string {
  try {
    return readDocxText(bytes);
  } catch (error) {
    if (error instanceof DocxError) throw new HttpError(422, 'unreadable_file', error.message);
    throw error;
  }
}

export interface ExtractDeps {
  llm: LlmClient;
  limits: { maxUploadBytes: number; maxDocChars: number };
}

export async function extractDocument({ base64 }: { base64: string }, { llm, limits }: ExtractDeps): Promise<ExtractResult> {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) throw new HttpError(400, 'empty_file', 'The uploaded file is empty.');
  if (bytes.length > limits.maxUploadBytes) {
    throw new HttpError(413, 'file_too_large', `Files can be at most ${Math.floor(limits.maxUploadBytes / 1024 / 1024)} MB.`);
  }

  const sniffed = sniffType(bytes);
  let text = '';
  let pages: number | undefined;
  let method: ExtractResult['method'] = sniffed.kind === 'unknown' ? 'text' : sniffed.kind;

  try {
    if (sniffed.kind === 'text') {
      text = new TextDecoder(sniffed.encoding ?? 'utf-8', { fatal: false }).decode(bytes);
    } else if (sniffed.kind === 'docx') {
      text = readDocx(bytes);
    } else if (sniffed.kind === 'pdf') {
      ({ text, pages } = await withTimeout(readPdf(bytes), PARSE_TIMEOUT_MS));
    } else if (sniffed.kind !== 'image') {
      throw new HttpError(415, 'unsupported_type', 'Unsupported file type. Upload a PDF, Word (.docx), image (PNG/JPEG/WebP) or text file.');
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, 'unreadable_file', 'This file could not be read. It may be damaged or password-protected.');
  }

  // Scans and photos have no text layer: fall back to AI transcription.
  if (normalizeDocument(text).length < MIN_USEFUL_TEXT && (sniffed.kind === 'image' || sniffed.kind === 'pdf')) {
    if (!llm.enabled) {
      throw new HttpError(422, 'needs_ai', 'This looks like a scan or photo with no selectable text. Turn on the AI service to read it, or paste the text instead.');
    }
    try {
      text = await llm.transcribe({ base64, mimeType: sniffed.mime });
      method = 'ocr';
    } catch (error) {
      if (error instanceof LlmError) throw new HttpError(502, 'ocr_failed', 'The AI service could not read this file. Try pasting the text instead.');
      throw error;
    }
  }

  text = normalizeDocument(text);
  if (text.length < MIN_USEFUL_TEXT) throw new HttpError(422, 'no_text', 'No readable text was found in this file.');

  const truncated = text.length > limits.maxDocChars;
  const result: ExtractResult = { text: truncated ? text.slice(0, limits.maxDocChars) : text, method, truncated };
  if (pages !== undefined) result.pages = pages;
  return result;
}

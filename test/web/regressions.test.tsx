import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import axe from 'axe-core';
import { useLocation } from '../../src/web/hooks/useLocation.js';
import { Hero } from '../../src/web/features/layout/Hero.js';
import { DocumentField } from '../../src/web/features/workspace/DocumentField.js';
import { AnnouncerProvider } from '../../src/web/hooks/useAnnouncer.js';
import { initialSession, sessionReducer, SessionProvider } from '../../src/web/state/session.js';
import { analyzeLocally } from '../../src/shared/offline.js';
import { DEFAULT_CONTEXT } from '../../src/shared/options.js';
import { buildBrief, briefToMarkdown } from '../../src/web/lib/brief.js';
import { placeFindings } from '../../src/web/features/explain/results/DocumentViewer.js';
import { suggestQuestions } from '../../src/web/lib/suggestions.js';

afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });
const text = 'The Landlord may enter and inspect the Premises at any time without prior notice. The tenant must pay a security deposit of Rs 50000.';
const analysis = analyzeLocally(text, DEFAULT_CONTEXT);

describe('browser regressions', () => {
  it('updates shared keys and paths after navigation events', () => {
    const { result } = renderHook(() => useLocation());
    act(() => { window.history.replaceState(null, '', '/s/abcdefghijklmnopqrstuv#new-key'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(result.current.hash).toBe('#new-key');
    act(() => { window.history.replaceState(null, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(result.current.pathname).toBe('/');
  });

  it('blocks uploads and clearing while analysis is busy', () => {
    const onText = vi.fn();
    const { container } = render(<SessionProvider><AnnouncerProvider><DocumentField label="Document" text={text} disabled onText={onText} /></AnnouncerProvider></SessionProvider>);
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(container.querySelector('input[type=file]')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear text' }));
    fireEvent.drop(screen.getByRole('textbox'), { dataTransfer: { files: [new File(['ignored'], 'ignored.txt')] } });
    expect(onText).not.toHaveBeenCalled();
  });

  it('has an accessible landing section and honest on-device wording', async () => {
    const { container } = render(<main><Hero /></main>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fine print.Clear answers.');
    expect(screen.getByRole('link', { name: 'Understand my document' })).toHaveAttribute('href', '#workspace');
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations).toEqual([]);
  });

  it('clears prior conversations and notes when a new document is analysed', () => {
    const previous = { ...initialSession(), notes: 'Private old note', chat: [{ id: '1', role: 'user' as const, text: 'Old question' }] };
    const next = sessionReducer(previous, { type: 'analysed', document: { text, label: 'Rental' }, analysis });
    expect(next.chat).toEqual([]);
    expect(next.notes).toBe('');
    expect(previous.notes).toBe('Private old note');
    expect(sessionReducer(next, { type: 'reset-document' }).document).toBeNull();
  });

  it('exports grounded terms and notes in the lawyer brief', () => {
    const brief = buildBrief({ analysis, docLabel: 'Rental', notes: '  Ask about entry.  ', labels: { role: 'Tenant', stage: 'Before signing', jurisdiction: 'India' }, now: new Date('2026-09-26T00:00:00Z') });
    const markdown = briefToMarkdown(brief);
    expect(markdown).toContain('Ask about entry.');
    expect(markdown).toContain('2026-09-26');
    expect(markdown).toContain(analysis.disclaimer);
    for (const term of brief.keyTerms) expect(text).toContain(term.quote);
  });

  it('only highlights quotes that exist and preserves text offsets', () => {
    const placed = placeFindings(text, analysis.clauses);
    expect(placed.length).toBeGreaterThan(0);
    for (const item of placed) expect(text.slice(item.start, item.end)).toBe(item.clause.quote);
    for (let index = 1; index < placed.length; index++) expect(placed[index]!.start).toBeGreaterThanOrEqual(placed[index - 1]!.end);
  });

  it('offers distinct, bounded follow-up questions', () => {
    const questions = suggestQuestions(analysis, 3);
    expect(questions.length).toBeLessThanOrEqual(3);
    expect(new Set(questions).size).toBe(questions.length);
    expect(suggestQuestions(analysis, 0)).toEqual([]);
  });
});

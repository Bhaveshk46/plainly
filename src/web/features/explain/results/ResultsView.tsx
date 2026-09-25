import { useEffect, useMemo, useRef, useState } from 'react';
import { languageDirection } from '../../../../shared/options.js';
import type { Analysis } from '../../../../shared/types.js';
import { Findings, type FindingsView, type Jump } from './Findings.js';
import { KeyFacts } from './KeyFacts.js';
import { Missing, Obligations, Questions, Resources } from './MoreSections.js';
import { NextSteps } from './NextSteps.js';
import { SectionNav, type NavSection } from './SectionNav.js';
import { SummaryCard } from './SummaryCard.js';
import { TrustNotices } from './TrustNotices.js';

interface Props {
  analysis: Analysis;
  documentText: string;
  onNewDocument: () => void;
  onEditText: () => void;
}

/** Wrap a section so the scroll-spy nav can find it. */
const Anchor = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <div id={id} className="scroll-mt-28">
    {children}
  </div>
);

export function ResultsView({ analysis, documentText, onNewDocument, onEditText }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState<FindingsView>('findings');
  const [jump, setJump] = useState<Jump | null>(null);
  const nonce = useRef(0);
  // How *this result* was produced (not where the mode toggle is now): the on-device engine
  // is rule-based, sent nothing anywhere, and carries no fallback notice.
  const onDevice = analysis.mode === 'offline' && !analysis.privacy.sentToAI && analysis.notice === null;

  // Move focus to the results so keyboard and screen-reader users land on them.
  useEffect(() => heading.current?.focus(), [analysis]);

  const sections = useMemo<NavSection[]>(
    () =>
      [
        { id: 'summary', label: 'Summary' },
        { id: 'steps', label: 'What to do next' },
        analysis.keyFacts.length ? { id: 'facts', label: 'Key details' } : null,
        { id: 'findings', label: 'Findings' },
        analysis.obligations.length ? { id: 'duties', label: 'Who does what' } : null,
        analysis.missing.length ? { id: 'gaps', label: 'Not in the document' } : null,
        analysis.questionsForLawyer.length ? { id: 'questions', label: 'Lawyer questions' } : null,
        analysis.resources.length ? { id: 'help', label: 'Free legal help' } : null,
      ].filter((section): section is NavSection => section !== null),
    [analysis],
  );

  const requestJump = (request: Omit<Jump, 'nonce'>): void => {
    nonce.current += 1;
    setView(request.target);
    setJump({ ...request, nonce: nonce.current });
  };

  return (
    // lang/dir follow the language the text is *actually* written in (English when AI was off).
    <div lang={analysis.outputLanguage} dir={languageDirection(analysis.outputLanguage)} className="grid gap-8 lg:grid-cols-[11.5rem_minmax(0,1fr)]">
      <SectionNav sections={sections} />
      <div className="flex min-w-0 flex-col gap-5">
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-extrabold tracking-tight text-fg outline-none">
          Your document at a glance
        </h2>
        <TrustNotices
          mode={analysis.mode}
          notice={analysis.notice}
          warnings={analysis.warnings}
          grounding={analysis.grounding}
          privacy={analysis.privacy}
          onDevice={onDevice}
        />
        <Anchor id="summary">
          <SummaryCard analysis={analysis} onNewDocument={onNewDocument} onEditText={onEditText} />
        </Anchor>
        <Anchor id="steps">
          <NextSteps steps={analysis.nextSteps} />
        </Anchor>
        <Anchor id="facts">
          <KeyFacts facts={analysis.keyFacts} />
        </Anchor>
        <Anchor id="findings">
          <Findings clauses={analysis.clauses} documentText={documentText} view={view} onViewChange={setView} jump={jump} onJump={requestJump} />
        </Anchor>
        <Anchor id="duties">
          <Obligations items={analysis.obligations} />
        </Anchor>
        <Anchor id="gaps">
          <Missing items={analysis.missing} />
        </Anchor>
        <Anchor id="questions">
          <Questions items={analysis.questionsForLawyer} />
        </Anchor>
        <Anchor id="help">
          <Resources items={analysis.resources} />
        </Anchor>
        <p className="text-[0.82rem] text-muted">{analysis.disclaimer}</p>
      </div>
    </div>
  );
}

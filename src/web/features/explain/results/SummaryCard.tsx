import { FilePlus2, Pencil, Square, Volume2 } from 'lucide-react';
import { Badge, Button, Card, Gauge, RiskBadge } from '../../../components/ui.js';
import { useSpeech } from '../../../hooks/useSpeech.js';
import { RISK_META } from '../../../lib/format.js';
import type { Analysis } from '../../../../shared/types.js';

interface Props {
  analysis: Analysis;
  onNewDocument: () => void;
  onEditText: () => void;
}

const ACCENT: Record<Analysis['risk']['level'], string> = {
  high: 'from-high to-high/0',
  medium: 'from-medium to-medium/0',
  low: 'from-low to-low/0',
};

export function SummaryCard({ analysis, onNewDocument, onEditText }: Props) {
  const { document: doc, summary, risk } = analysis;
  const speech = useSpeech();
  const counts = (['high', 'medium', 'low'] as const).filter((level) => risk.counts[level] > 0);

  return (
    <Card className="relative overflow-hidden" aria-labelledby="summary-title">
      <div aria-hidden className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${ACCENT[risk.level]}`} />
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <Gauge score={risk.score} level={risk.level} label="Overall risk" />
          <RiskBadge risk={risk.level} label={`Overall: ${RISK_META[risk.level].label.toLowerCase()}`} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{doc.typeLabel}</Badge>
            <span className="text-xs text-muted">{doc.wordCount.toLocaleString('en')} words</span>
          </div>
          <h3 id="summary-title" className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-fg">
            {summary.headline}
          </h3>
          <p className="mt-1 text-sm text-muted">{risk.rationale}</p>

          {counts.length ? (
            <ul aria-label="Terms found by priority" className="mt-3 flex flex-wrap gap-2">
              {counts.map((level) => (
                <li key={level}>
                  <RiskBadge risk={level} label={`${risk.counts[level]} ${RISK_META[level].label.toLowerCase()}`} />
                </li>
              ))}
            </ul>
          ) : null}

          <ul className="mt-4 list-disc space-y-1.5 ps-5 text-[0.95rem] text-fg marker:text-brand-text">
            {summary.plain.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>

          <div className="no-print mt-5 flex flex-wrap gap-2.5">
            {speech.supported ? (
              speech.speaking ? (
                <Button variant="secondary" size="sm" icon={Square} onClick={speech.stop}>
                  Stop reading
                </Button>
              ) : (
                <Button variant="secondary" size="sm" icon={Volume2} onClick={() => speech.speak([summary.headline, ...summary.plain].join('. '), analysis.outputLanguage)}>
                  Read summary aloud
                </Button>
              )
            ) : null}
            <Button variant="ghost" size="sm" icon={Pencil} onClick={onEditText}>
              Edit text
            </Button>
            <Button variant="ghost" size="sm" icon={FilePlus2} onClick={onNewDocument}>
              New document
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

import { BriefcaseBusiness, Copy, Download, Printer, Share2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { jurisdictionLabel, roleLabel, stageLabel } from '../../../shared/options.js';
import { Button, Callout, Card, Field, TextArea } from '../../components/ui.js';
import { useAnnounce } from '../../hooks/useAnnouncer.js';
import { briefFilename, briefToMarkdown, buildBrief } from '../../lib/brief.js';
import { copyText, downloadText } from '../../lib/clipboard.js';
import { useConfig } from '../../state/config.js';
import { useSession } from '../../state/session.js';
import { useWorkspace } from '../workspace/WorkspaceContext.js';
import { BriefPreview } from './BriefPreview.js';
import { ShareDialog, type CreatedShare } from './ShareDialog.js';

export function BriefTab() {
  const { state, dispatch } = useSession();
  const { config } = useConfig();
  const announce = useAnnounce();
  const { goTo } = useWorkspace();
  const [shareOpen, setShareOpen] = useState(false);
  const [created, setCreated] = useState<CreatedShare | null>(null);

  const { analysis, document: doc, context, notes } = state;

  const brief = useMemo(
    () =>
      analysis && doc
        ? buildBrief({
            analysis,
            docLabel: doc.label,
            notes,
            labels: { role: roleLabel(context.role), stage: stageLabel(context.stage), jurisdiction: jurisdictionLabel(context.jurisdiction) },
          })
        : null,
    [analysis, doc, notes, context],
  );

  if (!brief) {
    return (
      <Card className="flex flex-col items-start gap-4">
        <h2 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-fg">
          <BriefcaseBusiness aria-hidden className="size-6 text-brand-text" />
          Prepare for a lawyer
        </h2>
        <Callout tone="info">Explain a document first. Plainly will turn the findings into a one-page brief you can share with a lawyer, so the appointment is faster and cheaper.</Callout>
        <Button onClick={() => goTo('explain')}>Go to Explain</Button>
      </Card>
    );
  }

  const copy = async (): Promise<void> => {
    const ok = await copyText(briefToMarkdown(brief));
    announce(ok ? 'Brief copied to the clipboard.' : 'Copying was blocked by your browser. Use Download instead.');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print">
        <h2 className="flex items-center gap-2.5 text-2xl font-extrabold tracking-tight text-fg">
          <BriefcaseBusiness aria-hidden className="size-6 text-brand-text" />
          Prepare for a lawyer
        </h2>
        <p className="mt-1 text-muted">A one-page summary of your situation, the terms that worry you and the questions to ask, so you get more from every minute.</p>
      </div>

      <Card className="no-print flex flex-col gap-4">
        <Field label="Your notes (optional)" hint="Add what a lawyer should know: what was agreed verbally, dates, and the outcome you want.">
          {(props) => <TextArea {...props} rows={4} value={notes} onChange={(event) => dispatch({ type: 'notes', notes: event.target.value })} className="font-sans" />}
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button icon={Copy} onClick={() => void copy()}>
            Copy brief
          </Button>
          <Button
            variant="secondary"
            icon={Download}
            onClick={() => {
              downloadText(briefFilename(brief), briefToMarkdown(brief));
              announce('Brief downloaded.');
            }}
          >
            Download (.md)
          </Button>
          <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
            Print / save as PDF
          </Button>
          <Button variant="secondary" icon={Share2} disabled={!config.shares.enabled} onClick={() => setShareOpen(true)}>
            Share securely
          </Button>
        </div>
        {!config.shares.enabled ? <p className="text-[0.82rem] text-muted">Secure sharing needs the Plainly server, which is not reachable or has sharing switched off.</p> : null}
      </Card>

      <BriefPreview brief={brief} />

      {config.shares.enabled ? (
        <ShareDialog brief={brief} ttlHours={config.shares.ttlHours} created={created} onCreated={setCreated} open={shareOpen} onOpenChange={setShareOpen} />
      ) : null}
    </div>
  );
}

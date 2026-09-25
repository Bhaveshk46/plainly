import { Callout } from '../../../components/ui.js';
import { describeRedactions } from '../../../lib/format.js';
import type { Grounding, Privacy } from '../../../../shared/types.js';

interface Props {
  mode: 'ai' | 'offline';
  notice: string | null;
  warnings: string[];
  grounding?: Grounding | undefined;
  privacy: Privacy;
  /** True when the result came from the browser's own engine, not the server. */
  onDevice: boolean;
}

/** How this result was produced, what was checked, and where the data went. */
export function TrustNotices({ mode, notice, warnings, grounding, privacy, onDevice }: Props) {
  const masked = describeRedactions(privacy.redactions);
  const how =
    mode === 'ai'
      ? 'Explained by Gemini AI, combined with rule-based checks.'
      : onDevice
        ? 'Rule-based analysis on your device. No AI was used.'
        : 'Rule-based analysis: no AI was used for this result.';

  let privacyText: string;
  if (!privacy.sentToAI) privacyText = onDevice ? 'Privacy: analysed in your browser. Nothing was sent anywhere and nothing is stored.' : 'Privacy: analysed on the server only. Nothing was sent to an AI service and nothing is stored.';
  else if (masked) privacyText = `Privacy: hid ${masked} before sending to the AI, and restored them here. Nothing is stored.`;
  else privacyText = 'Privacy: the text was sent to the AI service for this request. Nothing is stored by Plainly.';

  return (
    <div className="flex flex-col gap-2.5">
      {notice ? <Callout tone="warn" role="note">{notice}</Callout> : null}
      {warnings.map((warning) => (
        <Callout key={warning} tone="warn" role="note">
          {warning}
        </Callout>
      ))}
      {grounding && grounding.dropped > 0 ? (
        <Callout tone="warn" role="note">
          {grounding.dropped} AI finding{grounding.dropped === 1 ? ' was' : 's were'} removed because {grounding.dropped === 1 ? 'its' : 'their'} quoted text could not be found in your document.
        </Callout>
      ) : grounding && grounding.verified > 0 ? (
        <Callout tone="good" role="note">
          Every quote below was checked against your document text.
        </Callout>
      ) : null}
      <p className="text-[0.82rem] text-muted">
        {how} {privacyText}
      </p>
    </div>
  );
}

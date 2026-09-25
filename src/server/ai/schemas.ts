/**
 * Gemini `responseSchema` definitions (OpenAPI subset). Constraining the model
 * to a schema means replies are parseable, and every field the UI renders has
 * a predictable type. The server still validates and sanitises the result.
 *
 * The schemas stay deliberately small: Google warns that very large or deeply
 * nested schemas can be rejected, so open-ended vocabularies (the clause
 * category) are described in text rather than listed as a huge enum, and the
 * server coerces whatever comes back.
 */

import { DOC_TYPES } from '../../shared/core/doctype.js';
import { RULES } from '../../shared/core/rules.js';

interface SchemaNode {
  type: 'STRING' | 'ARRAY' | 'OBJECT';
  description?: string;
  enum?: readonly string[];
  items?: SchemaNode;
  properties?: Record<string, SchemaNode>;
  required?: string[];
}

const string = (description: string): SchemaNode => ({ type: 'STRING', description });
const oneOf = (values: readonly string[], description?: string): SchemaNode => ({ type: 'STRING', enum: values, ...(description ? { description } : {}) });
const list = (items: SchemaNode, description?: string): SchemaNode => ({ type: 'ARRAY', items, ...(description ? { description } : {}) });
const object = (properties: Record<string, SchemaNode>): SchemaNode => ({ type: 'OBJECT', properties, required: Object.keys(properties) });

const RISK = ['high', 'medium', 'low', 'info'] as const;
const CATEGORY_HINT = `Closest category id from: ${RULES.map((rule) => rule.id).join(', ')}, or "other".`;

export const ANALYSIS_SCHEMA = object({
  documentType: oneOf(Object.keys(DOC_TYPES), 'Best matching document type.'),
  documentTypeLabel: string('Human-readable document type in the output language.'),
  headline: string('One sentence (max 20 words) telling the reader what this document is and the main takeaway.'),
  summaryPoints: list(string('One plain-language point.'), '3 to 6 key points a non-lawyer must know.'),
  keyFacts: list(object({ label: string('e.g. Monthly rent'), value: string('Value exactly as in the document.') }), 'Parties, dates, amounts, durations.'),
  clauses: list(
    object({
      hintId: string('Id of the pattern-check hint this refines, or empty string.'),
      category: string(CATEGORY_HINT),
      title: string('Short plain title, e.g. "Landlord can enter without notice".'),
      risk: oneOf(RISK, 'Risk for THIS reader.'),
      quote: string('Verbatim excerpt from the document, at most 300 characters.'),
      explanation: string('What it means in everyday words.'),
      whyItMatters: string('Concrete consequence for this reader.'),
      suggestion: string('What to ask for, negotiate or check.'),
    }),
  ),
  dismissedHintIds: list(string('hintId'), 'Hints that clearly do not apply to this document.'),
  obligations: list(
    object({ party: oneOf(['you', 'other', 'both'], 'Who must act.'), text: string('The duty in plain words.'), when: string('Deadline or timing, or empty.') }),
    'The most important duties and deadlines.',
  ),
  missing: list(object({ item: string('Something a document like this normally covers but this one does not.'), why: string('Why it matters.') })),
  questionsForLawyer: list(string('A specific question.'), '4 to 8 questions to ask a lawyer.'),
  nextSteps: list(object({ step: string('A concrete action.'), when: oneOf(['now', 'soon', 'before_signing', 'later']) }), '3 to 6 actions.'),
});

const side = {
  summary: string('What this document says about the topic, or "Not mentioned".'),
  quote: string('Verbatim excerpt, or empty if not mentioned.'),
  risk: oneOf([...RISK, 'absent'], 'Risk for this reader; "absent" if not mentioned.'),
};

export const COMPARE_SCHEMA = object({
  verdict: object({
    favors: oneOf(['a', 'b', 'neither'], 'Which document is better for this reader overall.'),
    headline: string('One sentence conclusion.'),
    reasons: list(string('A concrete reason.'), '2 to 5 reasons.'),
  }),
  rows: list(
    object({
      topic: string('Comparison topic, e.g. "Notice period".'),
      aSummary: side.summary,
      aQuote: side.quote,
      aRisk: side.risk,
      bSummary: side.summary,
      bQuote: side.quote,
      bRisk: side.risk,
      difference: oneOf(['same', 'differs', 'only_a', 'only_b']),
      better: oneOf(['a', 'b', 'neither'], 'Which side is better for this reader on this topic.'),
      comment: string('One sentence on why it matters.'),
    }),
  ),
  inconsistencies: list(string('A conflict or ambiguity within or between the documents.')),
  questionsForLawyer: list(string('A specific question.')),
});

export const ASK_SCHEMA = object({
  answer: string('Direct answer in 2 to 6 short sentences, including the practical implication for this reader.'),
  confidence: oneOf(['high', 'medium', 'low', 'not_found'], '"not_found" if the document does not address the question.'),
  citations: list(object({ quote: string('Verbatim excerpt from the document, at most 300 characters.') }), '1 to 3 supporting excerpts.'),
  caveats: list(string('Limits, ambiguities, or things to verify locally.')),
  followUps: list(string('A related question the reader might ask next.'), 'Up to 3.'),
});

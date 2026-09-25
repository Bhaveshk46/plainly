import { Cpu, EyeOff, FileSearch, KeyRound, ListChecks, Scale, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';

const STEPS: ReadonlyArray<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: UserRound, title: 'Tell us your situation', text: 'Who you are, whether you have signed, and where it applies. The same clause can be harmless for one side and harmful for the other.' },
  { icon: FileSearch, title: 'Add your document', text: 'Paste text or drop a PDF, Word file or photo of a paper notice. Try a sample if you just want to see it work.' },
  { icon: ListChecks, title: 'Get clarity and next steps', text: 'Risky terms with the exact quote, what they mean, what to ask for, and a to-do list matched to your stage.' },
];

const PRINCIPLES: ReadonlyArray<{ icon: LucideIcon; title: string; text: string }> = [
  { icon: Cpu, title: 'On your device, if you like', text: 'The rule-based engine runs in your browser. In on-device mode, pasted text and Word files never leave it.' },
  { icon: EyeOff, title: 'Optional personal-detail masking', text: 'In AI mode, masking is on by default. Common identifiers are hidden before reaching the AI, then restored for you. Review sensitive text yourself, too.' },
  { icon: ShieldCheck, title: 'No made-up quotes', text: 'Every quote the AI gives is checked against your text. Anything that cannot be found is removed, and you are told.' },
  { icon: KeyRound, title: 'A brief you control', text: 'Download or print a brief to take to a lawyer. Where secure sharing is enabled, links are encrypted in your browser and expire automatically.' },
];

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <div className="max-w-2xl">
        <h2 id="how-title" className="text-3xl font-extrabold tracking-tight text-fg">
          How Plainly works
        </h2>
        <p className="mt-3 text-muted">Three steps, and you stay in control of your data the whole way.</p>
      </div>

      <ol className="mt-10 grid gap-5 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }, index) => (
          <li key={title} className="relative rounded-2xl border border-line bg-surface p-6 shadow-card forced-border">
            <span className="absolute top-5 right-5 text-5xl leading-none font-black text-brand/15" aria-hidden>
              {index + 1}
            </span>
            <span className="grid size-11 place-content-center rounded-xl bg-brand-soft text-brand-text">
              <Icon aria-hidden className="size-5" />
            </span>
            <h3 className="mt-4 text-lg font-bold text-fg">
              <span className="sr-only">Step {index + 1}: </span>
              {title}
            </h3>
            <p className="mt-2 text-[0.95rem] text-muted">{text}</p>
          </li>
        ))}
      </ol>

      <div className="mt-16 flex items-center gap-3">
        <Scale aria-hidden className="size-6 text-brand-text" />
        <h2 className="text-2xl font-extrabold tracking-tight text-fg">Built around trust</h2>
      </div>
      <ul className="mt-6 grid gap-5 sm:grid-cols-2">
        {PRINCIPLES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-4 rounded-2xl border border-line bg-surface p-5 forced-border">
            <span className="grid size-10 shrink-0 place-content-center rounded-xl bg-low-bg text-low">
              <Icon aria-hidden className="size-5" />
            </span>
            <div>
              <h3 className="font-bold text-fg">{title}</h3>
              <p className="mt-1 text-[0.92rem] text-muted">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

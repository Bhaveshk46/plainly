import { ArrowDown, ArrowRight, Check, FileText, LockKeyhole, Cpu, Quote } from 'lucide-react';

function PreviewCard() {
  return (
    <div className="relative mx-auto w-full max-w-md" aria-label="Example of a Plainly explanation">
      <div className="mb-4 flex items-center justify-between text-xs font-semibold text-muted">
        <span className="flex items-center gap-2"><FileText aria-hidden className="size-4" /> FROM FINE PRINT TO PLAIN LANGUAGE</span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between gap-2 border-b border-line px-6 py-4"><span className="text-sm font-semibold">Rental agreement</span><span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">Fictional example</span></div>
        <div className="p-6">
          <p className="flex items-center gap-2 text-xs font-bold tracking-widest text-muted uppercase"><Quote aria-hidden className="size-4" /> What the document says</p>
          <blockquote className="quote-text mt-4 border-l-2 border-line pl-4 text-lg leading-relaxed text-fg">“The Landlord may enter and inspect the Premises at any time without prior notice.”</blockquote>
          <div className="my-5 flex items-center gap-3 text-brand-text"><span className="h-px flex-1 bg-line" /><ArrowDown aria-hidden className="size-5" /><span className="h-px flex-1 bg-line" /></div>
          <p className="text-xs font-bold tracking-widest text-brand-text uppercase">What it means for you</p>
          <h2 className="mt-2 text-xl font-bold tracking-tight">Your privacy could be at risk.</h2>
          <p className="mt-2 text-sm text-muted">This wording allows entry without telling you first. Ask for a notice period and clear exceptions for emergencies.</p>
          <div className="mt-5 rounded-xl border border-medium-line bg-medium-bg px-4 py-3 text-sm text-medium"><strong>Before you sign</strong><br />Discuss when entry is allowed.</div>
        </div>
        <div className="flex items-center gap-2 border-t border-line bg-brand-soft px-6 py-3 text-xs font-semibold text-brand-text"><Check aria-hidden className="size-4" /> Explanations linked to the original wording</div>
      </div>
      <p className="mt-4 text-center text-xs text-muted">Understand the clause. Know what to ask next.</p>
    </div>
  );
}

export function Hero() {
  return (
    <section aria-labelledby="page-title" className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-10 pb-12 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:pt-16 lg:pb-16">
      <div>
        <p className="mb-6 flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-brand-text uppercase"><span className="size-2 rounded-full bg-brand" /> Clarity before you commit</p>
        <h1 id="page-title" className="text-5xl leading-[1.06] font-semibold tracking-[-0.045em] text-fg sm:text-6xl lg:text-7xl">Fine print.<br /><span className="font-serif font-normal italic text-brand-text">Clear answers.</span></h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">Make sense of the documents that matter. Understand the terms, spot potential risks, and walk into your next conversation prepared.</p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <a href="#workspace" className="inline-flex min-h-12 items-center gap-3 rounded-xl bg-brand px-6 font-semibold text-brand-fg shadow-sm transition-colors hover:bg-brand-hover">Understand my document <ArrowRight aria-hidden className="size-4" /></a>
          <a href="#how" className="inline-flex min-h-12 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-fg hover:bg-surface-2">See how it works <ArrowDown aria-hidden className="size-4" /></a>
        </div>
        <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-3 text-xs font-medium text-muted">
          <li className="flex items-center gap-2"><LockKeyhole aria-hidden className="size-4 text-brand-text" /> No account required</li>
          <li className="flex items-center gap-2"><Cpu aria-hidden className="size-4 text-brand-text" /> On-device text analysis</li>
        </ul>
        <p className="mt-6 max-w-lg text-xs leading-relaxed text-muted" role="note"><strong>Information, not legal advice.</strong> Plainly can make mistakes. Have a qualified lawyer check decisions that matter.</p>
      </div>
      <PreviewCard />
    </section>
  );
}

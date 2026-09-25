'use client';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main" className="mx-auto grid min-h-[60vh] max-w-xl place-content-center gap-4 px-6 text-center"><h1 className="text-2xl font-bold">Something went wrong</h1><p className="text-muted">Plainly could not finish loading this view. Try again. Reloading the page clears your unsaved document and notes.</p><button type="button" onClick={reset} className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-brand-fg">Try again</button></main>;
}

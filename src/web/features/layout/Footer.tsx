import { Logo } from './Logo.js';

export function Footer() {
  return (
    <footer className="no-print mt-8 border-t border-line bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="font-extrabold tracking-tight text-fg">Plainly</span>
        </div>
        <p className="max-w-2xl text-sm text-muted">
          Plainly provides general legal information only. It is not legal advice, creates no lawyer–client relationship, and can make mistakes. Documents are processed in
          memory, never stored, and never logged. Sample documents are fictional.
        </p>
      </div>
    </footer>
  );
}

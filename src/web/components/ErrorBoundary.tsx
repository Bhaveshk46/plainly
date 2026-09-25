import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/** Last line of defence: show a calm message instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Only the error's name and component stack: never document text.
    console.error('Plainly crashed:', error.name, info.componentStack?.split('\n').slice(0, 4).join(' | '));
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main id="main" className="mx-auto grid min-h-[60vh] max-w-xl place-content-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">Something went wrong</h1>
        <p className="text-muted">Plainly hit an unexpected problem. Reloading may fix it, but clears your unsaved document and notes.</p>
        <p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-xl bg-brand px-5 font-semibold text-brand-fg hover:bg-brand-hover"
          >
            Reload Plainly
          </button>
        </p>
      </main>
    );
  }
}

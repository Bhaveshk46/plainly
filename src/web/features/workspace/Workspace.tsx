import { Tabs } from 'radix-ui';
import { BriefcaseBusiness, FileSearch, GitCompareArrows, MessageCircleQuestion, type LucideIcon } from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Spinner } from '../../components/ui.js';
import { useSession } from '../../state/session.js';
import { ExplainTab } from '../explain/ExplainTab.js';
import { SituationPanel } from './SituationPanel.js';
import { WorkspaceContext, type WorkspaceTab } from './WorkspaceContext.js';

// The other tabs load on demand, keeping the first screen small and fast.
const CompareTab = lazy(() => import('../compare/CompareTab.js').then((module) => ({ default: module.CompareTab })));
const AskTab = lazy(() => import('../ask/AskTab.js').then((module) => ({ default: module.AskTab })));
const BriefTab = lazy(() => import('../brief/BriefTab.js').then((module) => ({ default: module.BriefTab })));

const TABS: ReadonlyArray<{ id: WorkspaceTab; label: string; icon: LucideIcon }> = [
  { id: 'explain', label: 'Explain', icon: FileSearch },
  { id: 'compare', label: 'Compare', icon: GitCompareArrows },
  { id: 'ask', label: 'Ask', icon: MessageCircleQuestion },
  { id: 'brief', label: 'Lawyer brief', icon: BriefcaseBusiness },
];

const Loading = () => (
  <p role="status" className="flex items-center gap-2 py-10 text-muted">
    <Spinner /> Loading…
  </p>
);

export function Workspace() {
  const [tab, setTab] = useState<WorkspaceTab>('explain');
  const { state } = useSession();
  const value = useMemo(() => ({ tab, goTo: setTab }), [tab]);
  const ready = state.analysis !== null;

  return (
    <WorkspaceContext.Provider value={value}>
      <section id="workspace" aria-label="Workspace" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-10 sm:px-6">
        <div className="no-print mb-7 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-8">
          <div><p className="text-xs font-bold tracking-[0.16em] text-brand-text uppercase">Your document, made clearer</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Let’s take a closer look.</h2></div>
          <p className="max-w-sm text-sm text-muted">{ready ? 'Your analysis is ready. Explore the findings, ask a question, or prepare your brief.' : 'Set your situation, then add a document or try a sample below.'}</p>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
          <SituationPanel />

          <div className="min-w-0">
            <Tabs.Root value={tab} onValueChange={(next) => setTab(next as WorkspaceTab)}>
              <Tabs.List aria-label="Tools" className="no-print mb-5 grid grid-cols-2 gap-1.5 rounded-2xl border border-line bg-surface p-1.5 shadow-sm forced-border sm:grid-cols-4">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <Tabs.Trigger
                    key={id}
                    value={id}
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold whitespace-nowrap text-muted transition-colors hover:text-fg data-[state=active]:bg-brand data-[state=active]:text-brand-fg data-[state=active]:shadow-sm"
                  >
                    <Icon aria-hidden className="size-[1.05rem]" />
                    {label}
                    {(id === 'ask' || id === 'brief') && !ready ? <span className="sr-only"> (analyse a document first)</span> : null}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              {/* forceMount on Explain keeps the form and results alive while other tabs are open */}
              <Tabs.Content value="explain" forceMount hidden={tab !== 'explain'} className="focus-visible:outline-none">
                <ExplainTab />
              </Tabs.Content>
              <Tabs.Content value="compare" className="focus-visible:outline-none">
                <Suspense fallback={<Loading />}>
                  <CompareTab />
                </Suspense>
              </Tabs.Content>
              <Tabs.Content value="ask" className="focus-visible:outline-none">
                <Suspense fallback={<Loading />}>
                  <AskTab />
                </Suspense>
              </Tabs.Content>
              <Tabs.Content value="brief" className="focus-visible:outline-none">
                <Suspense fallback={<Loading />}>
                  <BriefTab />
                </Suspense>
              </Tabs.Content>
            </Tabs.Root>
          </div>
        </div>
      </section>
    </WorkspaceContext.Provider>
  );
}

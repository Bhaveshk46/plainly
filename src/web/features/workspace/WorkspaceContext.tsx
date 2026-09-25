import { createContext, useContext } from 'react';

export type WorkspaceTab = 'explain' | 'compare' | 'ask' | 'brief';

interface WorkspaceValue {
  tab: WorkspaceTab;
  goTo: (tab: WorkspaceTab) => void;
}

export const WorkspaceContext = createContext<WorkspaceValue>({ tab: 'explain', goTo: () => undefined });
export const useWorkspace = (): WorkspaceValue => useContext(WorkspaceContext);

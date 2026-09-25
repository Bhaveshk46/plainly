import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import { DEFAULT_CONTEXT, type Context } from '../../shared/options.js';
import type { Analysis, Answer, Comparison } from '../../shared/types.js';
import type { EngineMode } from '../lib/engine.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  answer?: Answer;
  pending?: boolean;
  error?: string;
}

export interface DocumentState {
  text: string;
  label: string;
}

export interface SessionState {
  context: Context;
  mode: EngineMode;
  redact: boolean;
  /** The document Ask and Brief work on. Held in memory only, never persisted. */
  document: DocumentState | null;
  analysis: Analysis | null;
  comparison: Comparison | null;
  chat: ChatMessage[];
  notes: string;
}

export type SessionAction =
  | { type: 'context'; patch: Partial<Context> }
  | { type: 'mode'; mode: EngineMode }
  | { type: 'redact'; redact: boolean }
  | { type: 'analysed'; document: DocumentState; analysis: Analysis }
  | { type: 'compared'; comparison: Comparison | null }
  | { type: 'reset-document' }
  | { type: 'chat-add'; message: ChatMessage }
  | { type: 'chat-update'; id: string; patch: Partial<ChatMessage> }
  | { type: 'notes'; notes: string };

export const initialSession = (mode: EngineMode = 'local'): SessionState => ({
  context: { ...DEFAULT_CONTEXT },
  mode,
  redact: true,
  document: null,
  analysis: null,
  comparison: null,
  chat: [],
  notes: '',
});

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'context':
      return { ...state, context: { ...state.context, ...action.patch } };
    case 'mode':
      return { ...state, mode: action.mode };
    case 'redact':
      return { ...state, redact: action.redact };
    case 'analysed':
      // A new document starts a fresh conversation and fresh notes.
      return { ...state, document: action.document, analysis: action.analysis, chat: [], notes: '' };
    case 'compared':
      return { ...state, comparison: action.comparison };
    case 'reset-document':
      return { ...state, document: null, analysis: null, chat: [], notes: '' };
    case 'chat-add':
      return { ...state, chat: [...state.chat, action.message] };
    case 'chat-update':
      return { ...state, chat: state.chat.map((message) => (message.id === action.id ? { ...message, ...action.patch } : message)) };
    case 'notes':
      return { ...state, notes: action.notes };
  }
}

interface SessionContextValue {
  state: SessionState;
  dispatch: Dispatch<SessionAction>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children, initial }: { children: ReactNode; initial?: SessionState }) {
  const [state, dispatch] = useReducer(sessionReducer, initial ?? initialSession());
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

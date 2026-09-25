import { Monitor, Moon, Sun, WifiOff, Sparkles, Cpu } from 'lucide-react';
import { useConfig } from '../../state/config.js';
import { useSession } from '../../state/session.js';
import { useSettings, type ThemePreference } from '../../hooks/useSettings.js';
import { cn } from '../../lib/cn.js';
import { Logo } from './Logo.js';

const THEMES: ReadonlyArray<{ id: ThemePreference; label: string; icon: typeof Sun }> = [
  { id: 'light', label: 'Light theme', icon: Sun },
  { id: 'auto', label: 'Match system theme', icon: Monitor },
  { id: 'dark', label: 'Dark theme', icon: Moon },
];

function ThemeSwitch() {
  const { theme, setTheme } = useSettings();
  return (
    <div role="group" aria-label="Colour theme" className="inline-flex h-11 shrink-0 items-center rounded-xl border border-line bg-surface-2 p-0.5 forced-border">
      {THEMES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-label={label}
          aria-pressed={theme === id}
          onClick={() => setTheme(id)}
          className={cn(
            'grid h-full w-10 place-content-center rounded-[0.65rem] transition-colors',
            theme === id ? 'bg-surface text-brand-text shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          <Icon aria-hidden className="size-[1.05rem]" />
        </button>
      ))}
    </div>
  );
}

function TextSize() {
  const { changeScale, canGrow, canShrink, scale } = useSettings();
  const base = 'flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2 font-bold text-fg transition-colors hover:bg-brand-soft aria-disabled:opacity-40 forced-border';
  return (
    <div role="group" aria-label={`Text size, currently ${scale} percent`} className="inline-flex gap-1">
      <button type="button" aria-label="Decrease text size" aria-disabled={!canShrink} onClick={() => canShrink && changeScale(-1)} className={cn(base, 'text-xs')}>
        A<span aria-hidden>−</span>
      </button>
      <button type="button" aria-label="Increase text size" aria-disabled={!canGrow} onClick={() => canGrow && changeScale(1)} className={cn(base, 'text-base')}>
        A<span aria-hidden>+</span>
      </button>
    </div>
  );
}

/** What the app is doing with the document right now, in one glance. */
function EnginePill() {
  const { config, status } = useConfig();
  const { state } = useSession();
  const ai = state.mode === 'ai' && config.ai.enabled;

  let label = 'On-device engine';
  let Icon = Cpu;
  if (status === 'offline') {
    label = 'Offline · on-device';
    Icon = WifiOff;
  } else if (ai) {
    label = `AI on · ${config.ai.provider}`;
    Icon = Sparkles;
  }
  return (
    <p
      role="status"
      className={cn(
        'hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold sm:inline-flex',
        ai ? 'border-low-line bg-low-bg text-low' : 'border-info-line bg-info-bg text-info',
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </p>
  );
}

export function Header() {
  return (
    <header className="no-print sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
        <a href="/" aria-label="Plainly, home" className="flex items-center gap-2.5 rounded-lg">
          <Logo />
          <span className="text-xl font-extrabold tracking-tight text-fg">Plainly</span>
        </a>
        <div className="flex flex-wrap items-center gap-2.5">
          <EnginePill />
          <TextSize />
          <ThemeSwitch />
        </div>
      </div>
    </header>
  );
}

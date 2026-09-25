/**
 * Design-system primitives. Every interactive control is at least 44px tall,
 * has a visible focus ring, and conveys state by text or shape as well as colour.
 */

import { Switch as RadixSwitch } from 'radix-ui';
import { CircleCheck, Info, LoaderCircle, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useId, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react';
import type { Risk } from '../../shared/options.js';
import { cn } from '../lib/cn.js';
import { RISK_META } from '../lib/format.js';

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-fg hover:bg-brand-hover shadow-sm',
  secondary: 'bg-surface text-brand-text border border-brand hover:bg-brand-soft',
  ghost: 'bg-transparent text-muted border border-line hover:bg-surface-2 hover:text-fg',
  danger: 'bg-high-bg text-high border border-high-line hover:brightness-95',
};
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3.5 text-sm',
  md: 'min-h-11 px-5 text-[0.95rem]',
  lg: 'min-h-12 px-6 text-base',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  /** Shows a spinner and ignores clicks, but stays focusable (aria-disabled) so focus is never lost. */
  busy?: boolean;
}

export function Button({ variant = 'primary', size = 'md', icon: Icon, busy = false, className, children, onClick, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      aria-disabled={busy || rest.disabled ? true : undefined}
      onClick={busy ? (event) => event.preventDefault() : onClick}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors duration-150',
        'aria-disabled:cursor-not-allowed aria-disabled:opacity-60 forced-border',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {busy ? <Spinner /> : Icon ? <Icon aria-hidden className="size-[1.1em] shrink-0" /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden className={cn('animate-spin-slow size-[1.1em] shrink-0', className)} />;
}

/** A toggle pill (aria-pressed), used for filters and suggested prompts. */
export function Chip({ pressed, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean }) {
  return (
    <button
      type="button"
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors forced-border',
        pressed ? 'border-brand bg-brand text-brand-fg' : 'border-line bg-surface-2 text-fg hover:border-brand hover:bg-brand-soft',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Badges & callouts
// ---------------------------------------------------------------------------

const RISK_ICON: Record<Risk, LucideIcon> = { high: OctagonAlert, medium: TriangleAlert, low: CircleCheck, info: Info };
const RISK_CLASS: Record<Risk, string> = {
  high: 'border-high-line bg-high-bg text-high',
  medium: 'border-medium-line bg-medium-bg text-medium',
  low: 'border-low-line bg-low-bg text-low',
  info: 'border-info-line bg-info-bg text-info',
};

/** Risk shown as shape + text + colour, so it never depends on colour alone. */
export function RiskBadge({ risk, label, className }: { risk: Risk; label?: string; className?: string }) {
  const Icon = RISK_ICON[risk];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap forced-border', RISK_CLASS[risk], className)}>
      <Icon aria-hidden className="size-3.5" />
      {label ?? RISK_META[risk].label}
    </span>
  );
}

type Tone = 'neutral' | 'good' | 'brand';
const TONE_CLASS: Record<Tone, string> = {
  neutral: 'border-info-line bg-info-bg text-info',
  good: 'border-low-line bg-low-bg text-low',
  brand: 'border-brand/40 bg-brand-soft text-brand-text',
};

export function Badge({ tone = 'neutral', icon: Icon, className, children }: { tone?: Tone; icon?: LucideIcon; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap forced-border', TONE_CLASS[tone], className)}>
      {Icon ? <Icon aria-hidden className="size-3.5" /> : null}
      {children}
    </span>
  );
}

type CalloutTone = 'info' | 'warn' | 'good' | 'danger';
const CALLOUT_CLASS: Record<CalloutTone, string> = {
  info: 'border-brand/40 bg-brand-soft text-fg',
  warn: 'border-medium-line bg-medium-bg text-medium',
  good: 'border-low-line bg-low-bg text-low',
  danger: 'border-high-line bg-high-bg text-high',
};
const CALLOUT_ICON: Record<CalloutTone, LucideIcon> = { info: Info, warn: TriangleAlert, good: CircleCheck, danger: OctagonAlert };

export function Callout({ tone = 'info', role, className, children }: { tone?: CalloutTone; role?: 'note' | 'alert' | 'status'; className?: string; children: ReactNode }) {
  const Icon = CALLOUT_ICON[tone];
  return (
    <div role={role} className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm forced-border', CALLOUT_CLASS[tone], className)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 [&_a]:underline">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6 forced-border', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ id, icon: Icon, children, className }: { id?: string; icon?: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <h3 id={id} className={cn('flex items-center gap-2 text-lg font-bold tracking-tight text-fg', className)}>
      {Icon ? <Icon aria-hidden className="size-5 text-brand-text" /> : null}
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

const CONTROL =
  'w-full min-h-11 rounded-xl border-[1.5px] border-line bg-surface px-3.5 py-2.5 text-[0.95rem] text-fg placeholder:text-muted/80 transition-colors hover:border-brand/60 focus-visible:border-brand disabled:opacity-60';

interface FieldProps {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  className?: string;
  children: (props: { id: string; 'aria-describedby': string | undefined; 'aria-invalid': true | undefined }) => ReactNode;
}

/** Label + hint + error wired to a control through ids. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-fg">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint ? (
        <p id={hintId} className="text-[0.82rem] text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-high">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SelectControl({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <select className={cn(CONTROL, 'appearance-none pe-10', className)} style={SELECT_ARROW} {...rest}>
      {children}
    </select>
  );
}

// A chevron drawn with CSS gradients: no image request, follows the text colour.
const SELECT_ARROW = {
  backgroundImage:
    'linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%)',
  backgroundPosition: 'calc(100% - 1.25rem) 55%, calc(100% - 0.9rem) 55%',
  backgroundSize: '0.4rem 0.4rem, 0.4rem 0.4rem',
  backgroundRepeat: 'no-repeat',
} as const;

export function TextArea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cn(CONTROL, 'resize-y font-mono text-[0.88rem] leading-relaxed', className)} {...rest} />;
}

export function TextInput({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cn(CONTROL, className)} {...rest} />;
}

/** A labelled on/off switch (Radix handles keyboard, focus and ARIA). */
export function SwitchRow({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={`${id}-d`}
        className="relative mt-0.5 h-7 w-12 shrink-0 cursor-pointer rounded-full border border-line bg-surface-2 transition-colors data-[state=checked]:border-brand data-[state=checked]:bg-brand disabled:cursor-not-allowed disabled:opacity-50 forced-border"
      >
        <RadixSwitch.Thumb className="block size-5 translate-x-1 rounded-full bg-fg shadow-sm transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:bg-brand-fg" />
      </RadixSwitch.Root>
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-sm font-semibold text-fg">
          {label}
        </label>
        <p id={`${id}-d`} className="text-[0.82rem] text-muted">
          {description}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk gauge
// ---------------------------------------------------------------------------

const GAUGE_COLOR: Record<'high' | 'medium' | 'low', string> = { high: 'text-high', medium: 'text-medium', low: 'text-low' };

/** A ring gauge. `role="meter"` exposes the value and a text description to assistive tech. */
export function Gauge({ score, level, label, size = 132 }: { score: number; level: 'high' | 'medium' | 'low'; label: string; size?: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score}
      aria-valuetext={`${RISK_META[level].label}, ${score} out of 100`}
      className={cn('relative shrink-0', GAUGE_COLOR[level])}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden focusable="false">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--surface-2)" strokeWidth="11" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-3xl leading-none font-extrabold tracking-tight text-fg tabular-nums">{score}</span>
        <span className="mt-1 text-[0.68rem] font-bold tracking-wider text-muted uppercase">of 100</span>
      </div>
    </div>
  );
}

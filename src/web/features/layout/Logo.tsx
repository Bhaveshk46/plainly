import { useId } from 'react';

/** The Plainly mark: a document whose lines resolve into a check. */
export function Logo({ size = 36 }: { size?: number }) {
  const gradient = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden focusable="false">
      <defs>
        <linearGradient id={gradient} x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#176354" />
          <stop offset="1" stopColor="#3a705c" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${gradient})`} />
      <path d="M12 12.5h16M12 18.5h16M12 24.5h8" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <circle cx="27.5" cy="27.5" r="6.5" fill="#fff" />
      <path d="m24.6 27.6 2.1 2.1 3.9-4.1" stroke="#176354" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

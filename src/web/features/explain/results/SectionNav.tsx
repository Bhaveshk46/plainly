import { useEffect, useState } from 'react';
import { cn } from '../../../lib/cn.js';

export interface NavSection {
  id: string;
  label: string;
}

/**
 * "On this page" navigation with scroll-spy. Desktop only: on small screens
 * the page is short enough to scroll, and the nav would just take space.
 */
export function SectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? '');

  useEffect(() => {
    const targets = sections.map((section) => document.getElementById(section.id)).filter((element): element is HTMLElement => element !== null);
    if (!targets.length) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = sections.find((section) => visible.has(section.id));
        if (first) setActive(first.id);
      },
      { rootMargin: '-96px 0px -55% 0px' },
    );
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label="On this page" className="no-print sticky top-24 hidden self-start lg:block">
      <p className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">On this page</p>
      <ul className="grid gap-0.5 border-s border-line">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              aria-current={active === section.id ? 'location' : undefined}
              className={cn(
                '-ms-px block border-s-2 py-1.5 ps-3.5 text-sm transition-colors',
                active === section.id ? 'border-brand font-semibold text-brand-text' : 'border-transparent text-muted hover:text-fg',
              )}
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

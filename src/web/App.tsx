'use client';

import { useLocation } from './hooks/useLocation.js';
import { AnnouncerProvider } from './hooks/useAnnouncer.js';
import { SettingsProvider } from './hooks/useSettings.js';
import { Footer } from './features/layout/Footer.js';
import { Header } from './features/layout/Header.js';
import { Hero } from './features/layout/Hero.js';
import { HowItWorks } from './features/layout/HowItWorks.js';
import { SharedBriefPage, shareIdFromPath } from './features/share/SharedBriefPage.js';
import { Workspace } from './features/workspace/Workspace.js';
import { ConfigProvider } from './state/config.js';
import { SessionProvider } from './state/session.js';

function Home() {
  return (
    <>
      <main id="main" tabIndex={-1} className="outline-none">
        <div className="no-print">
          <Hero />
        </div>
        <Workspace />
        <div className="no-print">
          <HowItWorks />
        </div>
      </main>
    </>
  );
}

export function App({ pathname = '/' }: { pathname?: string }) {
  const location = useLocation(pathname);
  const sharedId = shareIdFromPath(location.pathname);
  const isSharePath = location.pathname.startsWith('/s/');

  return (
    <SettingsProvider>
      <AnnouncerProvider>
        <ConfigProvider>
          <SessionProvider>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-brand focus:px-4 focus:py-3 focus:font-semibold focus:text-brand-fg"
            >
              Skip to main content
            </a>
            <Header />
            {isSharePath ? <SharedBriefPage id={sharedId} keyFragment={location.hash.slice(1)} /> : <Home />}
            <Footer />
          </SessionProvider>
        </ConfigProvider>
      </AnnouncerProvider>
    </SettingsProvider>
  );
}

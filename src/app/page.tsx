import type { Metadata } from 'next';
import { App } from '../web/App';

export const metadata: Metadata = {
  ...(process.env['SITE_URL'] ? { alternates: { canonical: '/' } } : {}),
};

export default function Page() { return <App />; }

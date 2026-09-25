import type { Metadata } from 'next';
import { App } from '../../../web/App';

export const metadata: Metadata = {
  title: 'Private shared brief',
  robots: { index: false, follow: false, noarchive: true },
};

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <App pathname={`/s/${encodeURIComponent(id)}`} />;
}

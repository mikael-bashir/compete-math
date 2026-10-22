import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SupernovaLab } from './lab';

// A preview of the proof supernova (what plays when a target is proved), with a replay button, a scrubber and a replayed run that ends in a
// verified proof. Exists on preview deployments and under `next dev`; production does not serve it.
export const metadata: Metadata = {
  title: 'Proof supernova · preview',
  robots: { index: false, follow: false },
};

export default function SupernovaLabPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return <SupernovaLab />;
}

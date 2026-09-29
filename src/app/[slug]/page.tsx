import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { EventApp } from '@/components/EventApp';
import { FALLBACK_TABS, getTabBySlug } from '@/lib/constants';
import { getAllConferenceTabs } from '@/lib/get-conferences';
import { fetchEventsCached } from '@/lib/fetch-events-cached';
import { buildCollectionPageJsonLd, buildBreadcrumbJsonLd, serializeJsonLd } from '@/lib/json-ld';

// Revalidate every 60s so new conferences/events appear without a redeploy
export const revalidate = 60;

export function generateStaticParams() {
  // Use fallback tabs for build-time static generation (guaranteed)
  return FALLBACK_TABS.map((tab) => ({ slug: tab.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const allTabs = await getAllConferenceTabs();
  const tab = getTabBySlug(slug, allTabs);
  if (!tab) return {};

  const allEvents = await fetchEventsCached();
  const count = allEvents.filter((e) => e.conference === tab.name).length;

  return {
    title: `${tab.name} Side Events`,
    description: `Browse ${count}+ side events for ${tab.name}. Filter by date, time, tags, and more.`,
    openGraph: {
      title: `${tab.name} Side Events | plan.wtf`,
      description: `Browse ${count}+ side events for ${tab.name}. Filter by date, time, tags, and more.`,
      url: `https://plan.wtf/${tab.slug}`,
      images: [{ url: '/logo.png' }],
    },
  };
}

export default async function ConferencePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const allTabs = await getAllConferenceTabs();
  const tab = getTabBySlug(slug, allTabs);
  if (!tab) redirect('/');

  const allEvents = await fetchEventsCached();
  const conferenceEvents = allEvents.filter((e) => e.conference === tab.name);

  const collectionJsonLd = buildCollectionPageJsonLd(tab.name, tab.slug, conferenceEvents);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(tab.name, tab.slug);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
      />
      <Suspense>
        <EventApp initialConference={tab.name} initialEvents={conferenceEvents} />
      </Suspense>
    </>
  );
}

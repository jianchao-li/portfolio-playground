import LandingView, { landingMetadata } from '@/components/LandingView';
import { landingParams } from '@/lib/landingPages';

// Results change daily; regenerate at most every 6 hours
export const revalidate = 21600;
// Only the pages listed in src/lib/landingPages.ts exist
export const dynamicParams = false;

export const generateStaticParams = () => landingParams('compare');

export const generateMetadata = ({ params }: { params: { slug: string } }) =>
  landingMetadata('compare', params.slug);

export default function Page({ params }: { params: { slug: string } }) {
  return <LandingView kind="compare" slug={params.slug} />;
}

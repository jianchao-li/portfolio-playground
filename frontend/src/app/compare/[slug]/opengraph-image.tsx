import { OG_SIZE, landingOgImage } from '@/components/landingOgImage';
import { landingParams } from '@/lib/landingPages';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Portfolio backtest comparison';

export const generateStaticParams = () => landingParams('compare');

export default function Image({ params }: { params: { slug: string } }) {
  return landingOgImage('compare', params.slug);
}

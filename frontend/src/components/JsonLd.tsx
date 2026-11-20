import { FAQ } from '@/lib/content';
import type { LandingPage } from '@/lib/landingPages';
import { landingPath } from '@/lib/landingPages';
import { ABOUT_URL, AUTHOR, SITE_NAME, SITE_URL, SOURCE_URL } from '@/lib/site';

type Thing = Record<string, unknown>;

const PERSON_ID = `${AUTHOR.url}/#person`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const APP_ID = `${SITE_URL}/#app`;

const person: Thing = {
  '@type': 'Person',
  '@id': PERSON_ID,
  name: AUTHOR.name,
  url: AUTHOR.url,
  sameAs: ['https://github.com/jianchao-li'],
};

const website: Thing = {
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  inLanguage: 'en',
  publisher: { '@id': PERSON_ID },
};

const app: Thing = {
  '@type': 'WebApplication',
  '@id': APP_ID,
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  description: 'Free portfolio backtesting tool: compare the historical returns, volatility, Sharpe ratio and drawdowns of ETFs and custom portfolios, with rebalancing, in 40 currencies.',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  featureList: [
    'Portfolio backtesting with custom weights',
    'Growth chart and drawdown chart',
    'Total and annualized return, volatility, Sharpe and Sortino ratios, max drawdown',
    'Monthly, quarterly or annual rebalancing',
    'Results in 40 currencies',
    'Shareable links and CSV export',
  ],
  image: `${SITE_URL}/og.jpg`,
  author: { '@id': PERSON_ID },
  sameAs: [SOURCE_URL, ABOUT_URL],
};

const faqPage: Thing = {
  '@type': 'FAQPage',
  '@id': `${SITE_URL}/#faq`,
  mainEntity: FAQ.map(({ question, answer }) => ({
    '@type': 'Question',
    name: question,
    acceptedAnswer: { '@type': 'Answer', text: answer },
  })),
};

const graph = (nodes: Thing[]) => ({ '@context': 'https://schema.org', '@graph': nodes });

export const homeGraph = () => graph([website, person, app, faqPage]);

export const landingGraph = (page: LandingPage) => {
  const url = `${SITE_URL}${landingPath(page)}`;
  return graph([
    website,
    person,
    {
      '@type': 'WebPage',
      '@id': url,
      url,
      name: page.heading,
      description: page.description,
      isPartOf: { '@id': WEBSITE_ID },
      about: { '@id': APP_ID },
      author: { '@id': PERSON_ID },
      breadcrumb: { '@id': `${url}#breadcrumb` },
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: page.linkLabel, item: url },
      ],
    },
  ]);
};

/** JSON-LD script; "<" is escaped so the data can't close the script tag. */
export default function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

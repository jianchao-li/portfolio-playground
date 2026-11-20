import { LANDING_PAGES, landingPath, type LandingPage } from '@/lib/landingPages';

/** Crawlable links to the comparison and classic-portfolio pages. */
export default function LandingLinks({ exclude, heading = 'Explore popular backtests' }: {
  /** The current page, left out of the lists. */
  exclude?: LandingPage;
  heading?: string;
}) {
  const pages = LANDING_PAGES.filter((p) => p !== exclude);
  const groups = [
    { title: 'Popular comparisons', items: pages.filter((p) => p.kind === 'compare') },
    { title: 'Classic portfolios', items: pages.filter((p) => p.kind === 'portfolios') },
  ];
  return (
    <nav className="guide-card landing-links" aria-labelledby="landing-links-heading">
      <h2 id="landing-links-heading">{heading}</h2>
      <div className="landing-links-groups">
        {groups.map(({ title, items }) => (
          <div key={title}>
            <h3>{title}</h3>
            <ul>
              {items.map((p) => (
                <li key={p.slug}><a href={landingPath(p)}>{p.linkLabel}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

import LandingLinks from './LandingLinks';
import { FAQ, METHODOLOGY, METRIC_DEFINITIONS } from '@/lib/content';

/**
 * Server-rendered explanation of the tool: how it works, what the statistics
 * mean, and common questions. Visible text for visitors and crawlers alike
 * (the FAQPage structured data mirrors the FAQ here).
 */
export default function SiteGuide() {
  return (
    <div className="guide">
      <LandingLinks />

      <section className="guide-card" aria-labelledby="how-it-works">
        <h2 id="how-it-works">How the backtest works</h2>
        <p className="guide-lead">
          Portfolio Playground replays history: pick ETFs, stocks, gold or bitcoin, give each a
          weight, and see how a portfolio would have grown, how bumpy the ride was, and how far it
          fell in the worst stretches, side by side with the alternatives.
        </p>
        <div className="guide-grid">
          {METHODOLOGY.map(({ heading, text }) => (
            <div key={heading}>
              <h3>{heading}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="guide-card" aria-labelledby="glossary">
        <h2 id="glossary">Portfolio statistics explained</h2>
        <dl className="guide-glossary">
          {Object.entries(METRIC_DEFINITIONS).map(([term, definition]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{definition}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="guide-card" aria-labelledby="faq">
        <h2 id="faq">Frequently asked questions</h2>
        <div className="guide-faq">
          {FAQ.map(({ question, answer }) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

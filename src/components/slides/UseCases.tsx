/**
 * "Use cases" slide shared by all five product decks — content sourced from
 * the team's usecases-5-slides.html. Each card: client tag, title, a
 * Problem/Solution pair, and a proof metric. Styled under `.uc-*` in
 * extras.css to match the kiosk theme (orange→teal top strip, orange problem
 * icon, teal solution icon).
 */
import { Eyebrow } from './common';

export interface UseCase {
  tag: string;
  title: string;
  problem: string;
  solution: string;
  metric: string;
}

const AlertIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const BoltIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
const TrendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
  </svg>
);

export function UseCasesSlide({ title, cases }: { title: string; cases: UseCase[] }) {
  return (
    <div className="wrap">
      <div data-anim>
        <Eyebrow tone="ember">Where it's already working</Eyebrow>
        <h2 className="h-title">{title}</h2>
      </div>
      <div className={`uc-grid ${cases.length === 2 ? 'cols-2' : ''}`} data-anim>
        {cases.map((c, i) => (
          <article className="uc-card" key={i} style={{ ['--uc-i' as string]: i }}>
            <span className="uc-tag">{c.tag}</span>
            <h3>{c.title}</h3>
            <div className="uc-row uc-problem">
              <span className="uc-icon"><AlertIcon /></span>
              <div className="uc-txt"><b>Problem statement</b>{c.problem}</div>
            </div>
            <div className="uc-row uc-solution">
              <span className="uc-icon"><BoltIcon /></span>
              <div className="uc-txt"><b>Solution</b>{c.solution}</div>
            </div>
            <div className="uc-metric">
              <span className="uc-icon"><TrendIcon /></span>
              <span className="uc-val">{c.metric}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

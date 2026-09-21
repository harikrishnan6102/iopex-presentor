import type { SlideDef } from '../deck/SlideDef';
import { Eyebrow, PainCard, ReportShots, TiltShot, mt } from './common';

const A = 'https://aurora.growatiopex.com/sites/default/files/2026-09/';

export const PEXMINER_SLIDES: SlideDef[] = [
  {
    label: 'Intro', className: 'pm-intro',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="ember">AI-powered quality assurance &amp; BI platform</Eyebrow>
          <h2 className="h-title">Every call. Every chat.<br />Actually reviewed.</h2>
          <p className="lede" style={mt(20)}>Pexminer transcribes, scores, and analyzes 100% of your voice and chat interactions — not a sample.</p>
          <ul className="bullet-list">
            <li><b>231 transactions</b> tracked in a single project view</li>
            <li><b>24 active projects</b> across teams</li>
            <li><b>47.16 average quality score</b>, tracked org-wide</li>
          </ul>
        </div>
        <div className="orb-stage">
          <img className="dv-brain-bg" src={`${A}Gemini_Generated_Image_5wygyx5wygyx5wyg-removebg-preview.png`} alt="" aria-hidden="true" />
          <img className="dv-logo" src={`${A}pexminer_logo.png`} alt="Pexminer" />
          <div className="orb-caption mono">Project Insights — org-wide transaction &amp; quality snapshot</div>
        </div>
      </div>
    ),
  },
  {
    label: 'Why', id: 'pm-why',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="ember">Why we built this</Eyebrow>
          <h2 className="h-title">2% sampling was missing<br />98% of the problem.</h2>
          <ul className="bullet-list">
            <li>Compliance violations going undetected until it's too late</li>
            <li>Quality scores swinging wildly, team to team — no consistency</li>
            <li>Revenue-relevant calls never reviewed for what worked</li>
          </ul>
          <Eyebrow tone="ember" style={mt(20)}>Real evidence</Eyebrow>
          <div className="pain-grid" style={mt(14)}>
            <PainCard title="0% – 89.6% quality score range across teams">same org, same rubric</PainCard>
            <PainCard title="Failed compliance check on a live $837.89 sale">caught only after the fact</PainCard>
          </div>
        </div>
        <ReportShots
          a={{ src: `${A}Revenue%20Generation%20%285%29.png`, alt: 'A compliance failure, flagged after the sale closed' }}
          b={{ src: `${A}dashboard%20%284%29.png`, alt: 'Quality Score — wildly inconsistent across teams' }}
        />
      </div>
    ),
  },
  {
    label: 'How', id: 'pm-features',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="ember">How it works</Eyebrow>
          <h2 className="h-title">Recording in.<br />Insight out.</h2>
          <ul className="bullet-list">
            <li>Auto-transcribes voice + chat, every channel</li>
            <li>Scores every interaction against the same rubric</li>
            <li>Sentiment, keyword, and compliance analysis, per call</li>
            <li>Built-in AI assistant — ask it directly about your data</li>
          </ul>
        </div>
        <ReportShots
          a={{ src: `${A}Agent%20insight%20view.png`, alt: 'Per-call breakdown — transcript, sentiment, quality, revenue' }}
          b={{ src: `${A}Chatbot.png`, alt: 'Pexminer Assistant — ask questions about your own data' }}
        />
      </div>
    ),
  },
  {
    label: 'What you get', id: 'pm-results',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="ember">What you get</Eyebrow>
          <h2 className="h-title">Revenue, quality, and compliance<br />— one number each.</h2>
          <ul className="bullet-list">
            <li><b>$6,570 total revenue</b> tracked, incl. $1,973.80 from upsells</li>
            <li><b>41.51% conversion rate</b> — 22 of 53 calls</li>
            <li><b>31 compliance fails</b> flagged automatically</li>
            <li><b>74.12% of non-conversions</b> traced to agent performance — diagnosable, not a mystery</li>
          </ul>
        </div>
        <TiltShot src={`${A}Revenue%20Generation.png`} alt="Overall Performance Report — revenue, conversion mix, compliance" />
      </div>
    ),
  },
];

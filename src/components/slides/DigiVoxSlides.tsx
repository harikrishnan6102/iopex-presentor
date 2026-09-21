import type { SlideDef } from '../deck/SlideDef';
import { Eyebrow, PainCard, ShotFrame, Stat, TiltShot, mt } from './common';

const A = 'https://aurora.growatiopex.com/sites/default/files/2026-09/';

export const DIGIVOX_SLIDES: SlideDef[] = [
  {
    label: 'Intro', className: 'dv-intro',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="ember">Live Interviews. Zero Coordination.</Eyebrow>
          <h2>Interviews that<br /><span className="line2">actually listen.</span></h2>
          <p className="lede" style={mt(20)}>One job description in. A ranked, proctored, bias-free shortlist out. DigiVox runs the entire interview — live, adaptive, and always on — so your team spends its time deciding, not scheduling.</p>
          <div className="stat-row">
            <Stat count={15000} suffix="+">interviews processed</Stat>
            <Stat value="$1">cost per interview</Stat>
            <Stat count={13} suffix="%">conversion ratio</Stat>
            <Stat count={500} suffix="+">interviews run in parallel</Stat>
          </div>
          <div className="pain-grid" style={mt(24)}>
            <PainCard title="Accents that match the room">Location-aware interviewer agents — India, Manila, US accents — so candidates hear an interviewer who sounds like their market, not a generic default.</PainCard>
            <PainCard title="Drill down to the tone, not just the transcript">Full audio playback alongside every score — hear tonal variation, hesitation, and confidence directly, instead of trusting the summary alone.</PainCard>
          </div>
        </div>
        <div className="orb-stage">
          <img className="dv-brain-bg" src={`${A}Gemini_Generated_Image_o9cwwco9cwwco9cw_1-removebg-preview.png`} alt="" aria-hidden="true" />
          <img className="dv-logo" id="dvLogo" src={`${A}Digivox-logo-white_updated%20%282%29.png`} alt="DigiVox" />
          <div className="orb-caption mono">live signal · behavioral &amp; NLP analysis</div>
        </div>
      </div>
    ),
  },
  {
    label: 'Why', id: 'dv-why',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="ember">Why we built this</Eyebrow>
          <h2 className="h-title">What we kept hearing<br />from hiring teams.</h2>
          <div className="quote-block">
            <p>Bias, inconsistency, wasted hours, and hires who cheated their way in. We built DigiVox to close all four gaps.</p>
          </div>
          <div className="pain-grid">
            <PainCard title="Biased">Human interviewers default to the "halo effect" — rewarding personality and confidence over actual competency.</PainCard>
            <PainCard title="Inconsistent">No two interviewers score the same way, making it nearly impossible to compare candidates fairly.</PainCard>
            <PainCard title="Slow">3–5 days lost per role to manual scheduling, resume screening, and reshuffling calendars.</PainCard>
            <PainCard title="Gameable">AI-assisted cheating tools slip the wrong candidates past traditional screens — undetected until it's too late.</PainCard>
          </div>
        </div>
        <TiltShot src={`${A}digivox_slide2-image.png`} alt="DigiVox home screen — My Interviews dashboard" />
      </div>
    ),
  },
  {
    label: 'How', id: 'dv-how',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="ember">How it works</Eyebrow>
          <h2 className="h-title">Set it up once.<br />DigiVox runs the rest.</h2>
          <div className="pain-grid" style={mt(20)}>
            <PainCard title="Step 1 — Create the interview">JD upload → auto-generated questions + metrics → customization.</PainCard>
            <PainCard title="Step 2 — Add candidates">Bulk upload, resume evaluation, custom timing/expiry.</PainCard>
            <PainCard title="Step 3 — Schedule & send">Trigger emails instantly or later, with timezone handling.</PainCard>
            <PainCard title="Step 4 — Proctored interview">OTP auth, multi-person detection, AI-usage detection, face tracking.</PainCard>
          </div>
          <p className="lede" style={mt(14)}>Four steps. Zero scheduling calls. One ranked shortlist waiting when it's done.</p>
        </div>
        <TiltShot src={`${A}digivox-trainer.png`} alt="Candidate taking a proctored DigiVox interview, with a monitoring warning displayed" />
      </div>
    ),
  },
  {
    label: 'Results', id: 'dv-report',
    content: (
      <div className="wrap" style={{ display: 'block' }}>
        <div data-anim>
          <Eyebrow tone="ember">After the interview</Eyebrow>
          <h2 className="h-title">Every interview ends in a decision,<br />not a transcript to dig through.</h2>
        </div>
        <div className="report-shots-row" data-anim>
          <div className="report-shot-col">
            <div className="tilt-card" data-tilt style={{ position: 'relative' }}>
              <ShotFrame src={`${A}dcde3869-a97f-4b46-b7ca-e061138db852.png`} alt="DigiVox interview report screen" />
              <span className="callout-num" style={{ top: '63%', left: '37%' }}>1</span>
              <span className="callout-num" style={{ top: '63%', left: '80%' }}>2</span>
              <span className="callout-num" style={{ top: '84%', left: '80%' }}>3</span>
            </div>
            <div className="callout-legend">
              <div><span className="callout-num static">1</span>Video/transcript drill-down</div>
              <div><span className="callout-num static">2</span>AI detection probability</div>
              <div><span className="callout-num static">3</span>Monitoring alerts</div>
            </div>
          </div>
          <div className="report-shot-col">
            <div className="tilt-card" data-tilt style={{ position: 'relative' }}>
              <ShotFrame src={`${A}overall_summary.png`} alt="DigiVox overall hiring summary screen" />
              <span className="callout-num" style={{ top: '38%', left: '12%' }}>4</span>
              <span className="callout-num" style={{ top: '48%', left: '48%' }}>5</span>
              <span className="callout-num" style={{ top: '48%', left: '86%' }}>6</span>
            </div>
            <div className="callout-legend">
              <div><span className="callout-num static">4</span>Overall hiring summary</div>
              <div><span className="callout-num static">5</span>Communication parameter performance</div>
              <div><span className="callout-num static">6</span>Per-metric evaluation</div>
            </div>
          </div>
        </div>
      </div>
    ),
  },
];

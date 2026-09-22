import type { SlideDef } from '../deck/SlideDef';
import { Eyebrow, PainCard, ReportShots, Stat, TiltShot, mt } from './common';
import { UseCasesSlide } from './UseCases';

const A = 'https://aurora.growatiopex.com/sites/default/files/2026-09/';

export const DIGIKOACH_SLIDES: SlideDef[] = [
  {
    label: 'Intro', className: 'dk-intro',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="ember">Personalized Agent Training Portal</Eyebrow>
          <h2 className="h-title">Training that starts at the actual gap.</h2>
          <p className="lede" style={mt(20)}>DigiKoach reads every agent's weak spot from Pexminer and builds the fix — automatically.</p>
          <div className="stat-row">
            <Stat value="2,000+">courses hosted on the platform</Stat>
            <Stat count={200} suffix="+">agents trained</Stat>
            <Stat count={73} suffix="%">average completion rate, +8% vs last month</Stat>
          </div>
        </div>
        <div className="orb-stage">
          <img className="dv-brain-bg" src={`${A}Gemini_Generated_Image_9c48rn9c48rn9c48%20%281%29-Photoroom.png`} alt="" aria-hidden="true" />
          <img className="dv-logo" src={`${A}digikoauch_logo.png`} alt="DigiKoach" />
        </div>
      </div>
    ),
  },
  {
    label: 'Why', id: 'dk-why',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="ember">Why we built this</Eyebrow>
          <h2 className="h-title">Generic training was fixing problems agents didn't have.</h2>
          <ul className="bullet-list">
            <li>One-size-fits-all modules, regardless of actual skill</li>
            <li>Weakness sat in QA data, never became a learning path</li>
            <li>Agents retrained on things they'd already mastered</li>
          </ul>
          <div className="stat-row" style={mt(20)}>
            <Stat count={65} suffix="%">Warranty &amp; Discount Mgmt — flagged as a lagging area</Stat>
            <Stat value="90% / 92%">Customer Understanding / Communication — already strong</Stat>
          </div>
        </div>
        <ReportShots
          anim={false}
          a={{ src: `${A}Agent%20Dashboard.png`, alt: 'Mandatory trainings auto-assigned from the gaps' }}
          b={{ src: `${A}Agent-Final_Exam.png`, alt: 'Team Lead dashboard — courses, agents, completion' }}
        />
      </div>
    ),
  },
  {
    label: 'How', id: 'dk-features',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="ember">How it works</Eyebrow>
          <h2 className="h-title">Gap identified. Curriculum assigned. Automatically.</h2>
          <div className="pain-grid" style={mt(20)}>
            <PainCard title="Auto-assigned modules">Mapped to real gaps.</PainCard>
            <PainCard title="Multimedia lessons">Video, docs, knowledge checks.</PainCard>
            <PainCard title="AI practice bot">Live coaching, zero pressure.</PainCard>
            <PainCard title="AI evaluation bot">Scored simulation, full report.</PainCard>
          </div>
        </div>
        <ReportShots
          a={{ src: `${A}Agent-Traning_module.png`, alt: 'Lesson library — structured video modules' }}
          b={{ src: `${A}Agent-practice_Lab-Chat.png`, alt: 'AI practice bot — real-time feedback mid-conversation' }}
        />
      </div>
    ),
  },
  {
    label: 'Use cases', id: 'dk-usecases',
    content: (
      <UseCasesSlide title={'Coaching that targets the gap, not the whole team.'} cases={[
        { tag: 'US electronics retailer', title: 'Automated, gap-specific remediation', problem: 'Training was generic — agents failing specific metrics (e.g. warranty, discounting) got the same courses as everyone else.', solution: 'DigiKoach reads Pexminer performance data and auto-assigns tailored modules only to agents who failed that metric.', metric: 'Training shifted from blanket to targeted' },
        { tag: 'US electronics retailer', title: 'Practice before it counts', problem: 'New agents had no safe environment to rehearse real scenarios before being scored live.', solution: 'Interactive AI roleplay with instant mid-conversation coaching, ahead of any scored evaluation.', metric: 'Live-call errors reduced pre-evaluation' },
      ]} />
    ),
  },
  {
    label: 'What you get', id: 'dk-results',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="ember">What you get</Eyebrow>
          <h2 className="h-title">Growth tracked the same way gaps were found.</h2>
          <div className="stat-row" style={mt(20)}>
            <Stat count={91} suffix="%">training completion, +6% week over week</Stat>
            <Stat count={312} suffix="">modules completed across the team</Stat>
            <Stat value="86.4/100">team quality score</Stat>
            <Stat count={68} suffix="%">sustained-lift rate — improvement that holds</Stat>
            <Stat count={91} suffix="%">adoption — 138 of 152 agents actively learning</Stat>
            <Stat value="+6.2 pts">quality lift from the top-performing course alone</Stat>
          </div>
        </div>
        <TiltShot src={`${A}Performance.png`} alt="Training completion vs. quality-score lift, tracked weekly" />
      </div>
    ),
  },
];

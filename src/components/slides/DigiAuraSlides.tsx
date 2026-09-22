import type { SlideDef } from '../deck/SlideDef';
import { Eyebrow, PainCard, ReportShots, TiltShot, mt } from './common';
import { UseCasesSlide } from './UseCases';

const A = 'https://aurora.growatiopex.com/sites/default/files/2026-09/';

export const DIGIAURA_SLIDES: SlideDef[] = [
  {
    label: 'Intro', className: 'da-intro',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="ember">An AI agent platform for the full development lifecycle</Eyebrow>
          <h2 className="h-title">From requirement to release — DigiAura runs the AI driven SDLC, not one step of it.</h2>
          <p className="lede" style={mt(20)}>DigiAura deploys a coordinated team of AI agents that take a project from requirement capture through fine-tuning, iteration, verification, build, and deployment — with full visibility into every stage, for every stakeholder.</p>
          <ul className="bullet-list">
            <li>One platform — requirements to deployment, zero handoffs between tools</li>
            <li>Full agent observability — real-time status on every agent, every stage</li>
            <li>Pre-defined domain knowledge — zero ramp-up time on a new project</li>
          </ul>
        </div>
        <div className="orb-stage">
          <img className="dv-brain-bg" src={`${A}Gemini_Generated_Image_7a558r7a558r7a55-Photoroom.png`} alt="" aria-hidden="true" />
          <img className="dv-logo" src={`${A}Digiaura%20logo.png`} alt="DigiAura" />
        </div>
      </div>
    ),
  },
  {
    label: 'Why', id: 'da-why',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="ember">Why we built this</Eyebrow>
          <h2 className="h-title">Software delivery doesn't fail in one place. It fails at every hand-off.</h2>
          <ul className="bullet-list">
            <li>Requirements get reinterpreted — or quietly lost — moving from stakeholder to engineer</li>
            <li>Every review and iteration cycle costs days, because it waits on a human queue</li>
            <li>Verification gets bolted on at the end, catching problems only after they're expensive to fix</li>
            <li>Deployment and project tracking live in separate tools — nobody sees the whole pipeline at once</li>
          </ul>
        </div>
        <TiltShot src={`${A}Screenshot%202026-09-12%20at%201.04.18%E2%80%AFPM.png`} alt="DigiAura" />
      </div>
    ),
  },
  {
    label: 'Features', id: 'da-features',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="ember">Features: the AI-DLC agent chain</Eyebrow>
          <h2 className="h-title">One agent team. Zero handoffs. Full control over how they work.</h2>
          <div className="pain-grid" style={mt(20)}>
            <PainCard title="Five agents, one pipeline">Requirement → Development → Verification → Deployment, plus a live visibility layer over every stage. Nothing falls through the gap between them.</PainCard>
            <PainCard title="Connects to what you already run">Native MCP integrations — Salesforce, ServiceNow, Jira, and more. Agents work inside your existing tools, not around them.</PainCard>
            <PainCard title="Full observability, down to the token">Track every agent's status, decisions, and token consumption in real time — no black-box automation.</PainCard>
            <PainCard title="Autonomous or human-in-the-loop, your call">Configure each agent as fully autonomous or semi-autonomous with approval gates. Group agents into squads with defined handovers, so work moves cleanly from one stage to the next.</PainCard>
          </div>
        </div>
        <TiltShot src={`${A}Screenshot%202026-09-12%20at%201.03.54%E2%80%AFPM.png`} alt="DigiAura" />
      </div>
    ),
  },
  {
    label: 'Use cases', id: 'da-usecases',
    content: (
      <UseCasesSlide title={'One agent pipeline. Zero handoff friction.'} cases={[
        { tag: 'Enterprise client', title: 'Building an app with agents, not sprints', problem: 'Needed a full Incident Management application built without the usual BA→Dev→Test→Deploy handoff delays.', solution: 'Autonomous agents executed the BA, Developer, Tester, and Deployment roles end-to-end; humans acted strictly as approvers.', metric: 'Full app shipped, human role = approval only' },
        { tag: 'Enterprise client', title: 'No lost context across tools', problem: 'Requirements traditionally lost fidelity moving across Jira, GitHub, Salesforce, and ServiceNow.', solution: 'Requirements connect directly to code and tests across all four tools with no manual intervention.', metric: 'Zero manual handoff between stages' },
      ]} />
    ),
  },
  {
    label: 'Results', id: 'da-results',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="ember">Results &amp; Outcomes</Eyebrow>
          <h2 className="h-title">The whole SDLC, visible and accountable — not five tools stitched together with status meetings.</h2>
          <div className="pain-grid" style={mt(20)}>
            <PainCard title="Full-cycle automation">one platform instead of five disconnected tools passing work by hand</PainCard>
            <PainCard title="End-to-end traceability">every requirement traced to the exact code and test that satisfies it</PainCard>
            <PainCard title="Faster iteration loops">agents iterate in parallel, not one human-review queue at a time</PainCard>
            <PainCard title="Real-time project visibility">stakeholders see actual progress, not a sprint report written after the fact</PainCard>
          </div>
        </div>
        <ReportShots
          a={{ src: `${A}Screenshot%202026-09-12%20at%201.01.40%E2%80%AFPM.png`, alt: 'DigiAura' }}
          b={{ src: `${A}Screenshot%202026-09-12%20at%201.05.04%E2%80%AFPM.png`, alt: 'DigiAura' }}
        />
      </div>
    ),
  },
];

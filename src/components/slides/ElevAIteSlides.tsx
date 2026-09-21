import type { SlideDef } from '../deck/SlideDef';
import { Eyebrow, PainCard, ReportShots, TiltShot, mt } from './common';

const A = 'https://aurora.growatiopex.com/sites/default/files/2026-09/';

export const ELEVAITE_SLIDES: SlideDef[] = [
  {
    label: 'Intro', className: 'ev-intro',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="gold">An agentic AI platform</Eyebrow>
          <h2>Beyond chatbots — AI that<br /><span className="line2">closes the loop, deployed 60% faster.</span></h2>
          <p className="lede" style={mt(20)}>ElevAIte is iOPEX's agentic AI platform: Command Agents that don't just answer, they observe, decide, and act across your service chain.</p>
          <ul className="bullet-list">
            <li><b>Horizon 2 Enterprise Innovator</b> — HFS Horizons, Agentic Services 2026</li>
            <li><b>60% faster deployment</b> with the low-code Agentic AI Studio</li>
            <li><b>Hours not weeks</b>, to connect a new enterprise data source</li>
          </ul>
        </div>
        <div className="flow-stage">
          <img className="ev-flow-bg" src={`${A}Gemini_Generated_Image_vom9nzvom9nzvom9-removebg-preview.png`} alt="" aria-hidden="true" />
          <img className="ev-logo" id="evLogo" src={`${A}elevaite_logo_negative.png`} alt="elevAIte" />
          <div className="flow-caption mono">Data Studio, Agentic AI Studio, Runtime Platform — the productized foundation of Intelligence as a Service</div>
        </div>
      </div>
    ),
  },
  {
    label: 'Why', id: 'ev-why',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="gold">Why we built this</Eyebrow>
          <h2 className="h-title">Chatbots answer. They don't act.<br />That gap was costing a 5x efficiency edge.</h2>
          <ul className="bullet-list">
            <li>Most companies stall at Phase 1 — conversational AI that talks but doesn't execute</li>
            <li>Workflows still needed a human to manually trigger every next step</li>
            <li>Companies that automate now gain a measurable competitive edge — laggards fall behind</li>
          </ul>
          <Eyebrow tone="gold" style={mt(20)}>The maturity curve</Eyebrow>
          <div className="pain-grid" style={mt(14)}>
            <PainCard title="Phase 1 AI Chatbots">conversational only</PainCard>
            <PainCard title="Phase 2 AI-Assisted Workflows">hybrid, still human-triggered</PainCard>
            <PainCard title="Phase 3 Command Agents">fully autonomous, closes the loop</PainCard>
          </div>
        </div>
        <TiltShot src={`${A}Screenshot%202026-09-12%20at%2012.15.03%E2%80%AFPM.png`} alt="Beyond Chatbots — the rise of Command Agents" />
      </div>
    ),
  },
  {
    label: 'How', id: 'ev-features',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="gold">How it works</Eyebrow>
          <h2 className="h-title">Connect a data source in hours.<br />Ship an agent 60% faster.</h2>
          <div className="pain-grid" style={mt(20)}>
            <PainCard title="Data Studio">ready integrations to Salesforce, ServiceNow, SAP &amp; more; real-time sync via webhooks</PainCard>
            <PainCard title="Agentic AI Studio">low-code, drag-and-drop workflows, model marketplace, pre-built functions</PainCard>
            <PainCard title="Runtime Platform">coordinates agents across systems via open APIs, with governed autonomy</PainCard>
            <PainCard title="Enterprise-grade security">SSO (AD, OAuth, Google, Okta), role-based access, input/output guardrails that strip PII and block prompt injection</PainCard>
          </div>
        </div>
        <ReportShots
          a={{ src: `${A}Screenshot%202026-09-12%20at%2012.16.03%E2%80%AFPM.png`, alt: 'Live in the platform — an S3 ingest pipeline running end to end' }}
          b={{ src: `${A}Screenshot%202026-09-12%20at%2012.16.57%E2%80%AFPM.png`, alt: 'Data pipelines — connections, AI pipelines, scheduling, real-time sync' }}
        />
      </div>
    ),
  },
  {
    label: 'What you get', id: 'ev-results',
    content: (
      <div className="wrap">
        <div data-anim>
          <Eyebrow tone="gold">What you get</Eyebrow>
          <h2 className="h-title">Proven speed, proven security,<br />proven at scale.</h2>
          <ul className="bullet-list">
            <li><b>60% faster deployment</b> — pilot to production, not quarters</li>
            <li><b>Hours not weeks</b>, to connect a new enterprise data source</li>
            <li><b>Enterprise-grade reliability</b>, from pilot to global scale</li>
          </ul>
          <Eyebrow tone="gold" style={mt(20)}>Security, built in — not bolted on</Eyebrow>
          <ul className="bullet-list">
            <li>Single Sign-On across Active Directory, OAuth, Google SSO, and Okta</li>
            <li>Role-based access control — every user sees only what their role needs</li>
            <li>Input guardrails — automatic PII removal and prompt-injection defense</li>
            <li>Output guardrails — profanity, tone, and conversational-style control</li>
          </ul>
        </div>
        <TiltShot src={`${A}Screenshot%202026-09-12%20at%2012.17.56%E2%80%AFPM.png`} alt="Enterprise-grade security, built in — SSO, RBAC, and guardrails on every input and output" />
      </div>
    ),
  },
];

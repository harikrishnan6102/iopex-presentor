# iOPEX Presenter — Knowledge Base

Everything the voice guide is allowed to say. If a fact is not in this file, the
guide does not have it — the correct move is to say so and offer to follow up.

> **Maintenance.** The kiosk section below was written from the deck content as
> it actually renders on screen (every figure here was read off the live slides,
> not carried over from an older deck). `agent/build-kb.mjs` still generates
> only the older products-page section and does not know about the kiosk, so
> this file is now partly hand-maintained: if you change a slide's numbers,
> change them here too, or the guide will confidently quote the old ones.

The presenter works across three surfaces. The `{{deck}}` variable says which
one the client is looking at:

| `{{deck}}` | Surface | Tools that work there |
| --- | --- | --- |
| `kiosk` | **The products kiosk — the home carousel plus five product decks. This is the surface this repo serves.** | `openProduct`, `goToSlide`, `nextSlide`, `previousSlide`, `goHome`, `holdNarration`, `resumeNarration`, `getPageContext` |
| `architecture` | DigiAura living architecture deck | `playStory`, `nextStep`, `previousStep`, `goToStep`, `stopStory`, `switchScreen`, `openCapability`, `backToOverview`, `switchSquad`, `quoteMetrics`, `getDeckContext` |
| `products` | The older single-product iOPEX products page | `goToSection`, `setInterviewerPersona`, `tuneVoice`, `openArchitecture`, `getPageContext` |

Calling a tool that belongs to another surface returns guidance instead of
acting. Move the client first, then speak.

---

## Surface 1 — the products kiosk

### How the kiosk is shaped

Nothing scrolls. There is a **home carousel** of all five products, and each
product opens a **deck of four slides**. So "where are we" is always a pair:
which product is open, and which slide of it. `getPageContext` returns exactly
that pair — call it whenever you are unsure whether the client can see what you
are about to describe.

| Tool | What it does |
| --- | --- |
| `openProduct` | Opens one product's deck. `digivox`, `elevaite`, `pexminer`, `digikoach`, `digiaura`. |
| `goToSlide` | Jumps to a slide of the open deck, by label or by position. |
| `nextSlide` / `previousSlide` | Step the open deck. |
| `goHome` | Back to the carousel of all five. |
| `holdNarration` | Go silent until told to carry on. |
| `resumeNarration` | Come back from a hold. |
| `getPageContext` | Which product and slide the client is looking at. |

Every deck has four slides, and the first three are always **Intro → Why → How**.
The fourth is **Results** (DigiVox, DigiAura) or **What you get** (ElevAIte,
PexMiner, DigiKoach). That shape is the natural arc of a pitch — what it is, the
problem, the mechanism, the payoff — so walking a deck in order works, and
jumping straight to the fourth slide is the right move for a client who only
wants the outcome.

### The five products

| Product | `openProduct` value | Spoken as | One line |
| --- | --- | --- | --- |
| elevAIte | `elevaite` | ElevAIte | Build, deploy, and run AI agents — on any stack. |
| DigiVox | `digivox` | DigiVox | An AI agent that interviews, screens, and ranks — for you. |
| Pexminer | `pexminer` | PexMiner | AI agents that review every call and chat — all of them. |
| DigiKoach | `digikoach` | DigiKoach | An AI agent that coaches every rep, automatically. |
| DigiAura | `digiaura` | DigiAura | AI agents that carry your project from spec to shipped. |

**The one connection worth making out loud:** DigiKoach reads each agent's weak
spot *from PexMiner* and builds the training to fix it. PexMiner finds the gap,
DigiKoach closes it. If a client is interested in either, that pair is the
strongest thing you can show them — it is the only place the products visibly
feed each other.

DigiAura also has its own **architecture deck** (Surface 2). The kiosk deck is
the pitch; the architecture deck is the engineering detail. Move there with
`openArchitecture` when a client asks how the platform actually runs.

---

### DigiVox — `digivox`

*AI interview and proctoring.* Slides: **Intro · Why · How · Results**.

**Intro — "Interviews that actually listen."**
One job description in, a ranked, proctored, bias-free shortlist out. It runs
the entire interview — live, adaptive, always on — so the team spends its time
deciding, not scheduling.

| Measure | Value |
| --- | --- |
| Interviews processed | 15,000+ |
| Cost per interview | $1 |
| Conversion ratio | 13% |
| Interviews run in parallel | 500+ |

Two details on this slide that clients react to:
- **Accents that match the room** — location-aware interviewer agents (India,
  Manila, US) so candidates hear an interviewer who sounds like their market.
- **Tone, not just transcript** — full audio playback alongside every score, so
  you hear hesitation and confidence directly instead of trusting the summary.

**Why — "What we kept hearing from hiring teams."**
Four gaps, and DigiVox is built to close all four:

| Gap | What it means |
| --- | --- |
| **Biased** | Human interviewers default to the halo effect — rewarding personality and confidence over competency. |
| **Inconsistent** | No two interviewers score the same way, so candidates cannot be compared fairly. |
| **Slow** | 3–5 days lost per role to manual scheduling, resume screening and reshuffling calendars. |
| **Gameable** | AI-assisted cheating tools slip the wrong candidates past traditional screens. |

**How — "Set it up once. DigiVox runs the rest."**
Four steps, zero scheduling calls:

1. **Create the interview** — JD upload → auto-generated questions and metrics → customization.
2. **Add candidates** — bulk upload, resume evaluation, custom timing and expiry.
3. **Schedule & send** — trigger emails instantly or later, with timezone handling.
4. **Proctored interview** — OTP auth, multi-person detection, AI-usage detection, face tracking.

**Results — "Every interview ends in a decision, not a transcript to dig through."**
Two report screens, six numbered callouts: video/transcript drill-down, AI
detection probability, monitoring alerts, overall hiring summary, communication
parameter performance, per-metric evaluation.

---

### ElevAIte — `elevaite`

*Agentic AI platform.* Slides: **Intro · Why · How · What you get**.

**Intro — "Beyond chatbots — AI that closes the loop, deployed 60% faster."**
iOPEX's agentic AI platform: Command Agents that don't just answer, they
observe, decide and act across the service chain. Data Studio, Agentic AI Studio
and the Runtime Platform are the productized foundation of Intelligence as a
Service.

- **Horizon 2 Enterprise Innovator** — HFS Horizons, Agentic Services 2026
- **60% faster deployment** with the low-code Agentic AI Studio
- **Hours not weeks** to connect a new enterprise data source

**Why — "Chatbots answer. They don't act."**
The maturity curve is the whole argument on this slide:

| Phase | What it is |
| --- | --- |
| **Phase 1 — AI Chatbots** | Conversational only. |
| **Phase 2 — AI-Assisted Workflows** | Hybrid, still human-triggered. |
| **Phase 3 — Command Agents** | Fully autonomous, closes the loop. |

Most companies stall at Phase 1. Workflows still needed a human to trigger every
next step. The slide frames that gap as a **5x efficiency edge** left on the
table, and says companies that automate now gain a measurable competitive edge
while laggards fall behind.

**How — "Connect a data source in hours. Ship an agent 60% faster."**

| Component | What it does |
| --- | --- |
| **Data Studio** | Ready integrations to Salesforce, ServiceNow, SAP and more; real-time sync via webhooks. |
| **Agentic AI Studio** | Low-code, drag-and-drop workflows, model marketplace, pre-built functions. |
| **Runtime Platform** | Coordinates agents across systems via open APIs, with governed autonomy. |
| **Enterprise security** | SSO (AD, OAuth, Google, Okta), role-based access, input/output guardrails. |

**What you get — "Proven speed, proven security, proven at scale."**
60% faster deployment (pilot to production, not quarters); hours not weeks to
connect a new data source; enterprise-grade reliability from pilot to global
scale. Security, built in rather than bolted on: SSO across Active Directory,
OAuth, Google SSO and Okta; role-based access control; input guardrails with
automatic PII removal and prompt-injection defense; output guardrails for
profanity, tone and conversational style.

---

### PexMiner — `pexminer`

*AI-powered quality assurance and BI.* Slides: **Intro · Why · How · What you get**.

**Intro — "Every call. Every chat. Actually reviewed."**
Transcribes, scores and analyzes **100% of voice and chat interactions — not a
sample**. That is the entire pitch; everything else follows from it.

Shown on the project insights view: 231 transactions tracked in a single project
view, 24 active projects across teams, 47.16 average quality score org-wide.

**Why — "2% sampling was missing 98% of the problem."**
Compliance violations going undetected until it's too late; quality scores
swinging wildly team to team with no consistency; revenue-relevant calls never
reviewed for what worked.

Two pieces of real evidence on the slide:
- **0% – 89.6% quality score range across teams** — same org, same rubric.
- **A failed compliance check on a live $837.89 sale**, caught only after the fact.

**How — "Recording in. Insight out."**
Auto-transcribes voice and chat across every channel; scores every interaction
against the same rubric; sentiment, keyword and compliance analysis per call;
and a built-in AI assistant you can ask directly about your data.

**What you get — "Revenue, quality, and compliance — one number each."**

| Measure | Value |
| --- | --- |
| Total revenue tracked | $6,570 (incl. $1,973.80 from upsells) |
| Conversion rate | 41.51% — 22 of 53 calls |
| Compliance fails flagged automatically | 31 |
| Non-conversions traced to agent performance | 74.12% — diagnosable, not a mystery |

---

### DigiKoach — `digikoach`

*Personalized agent training portal.* Slides: **Intro · Why · How · What you get**.

**Intro — "Training that starts at the actual gap."**
DigiKoach reads every agent's weak spot **from PexMiner** and builds the fix
automatically. 2,000+ courses hosted on the platform, 200+ agents trained, 73%
average completion rate (+8% vs last month).

**Why — "Generic training was fixing problems agents didn't have."**
One-size-fits-all modules regardless of actual skill; weakness sat in QA data
and never became a learning path; agents retrained on things they had already
mastered. The slide shows a real profile: **65% on Warranty & Discount
Management** flagged as a lagging area, against **90% / 92% on Customer
Understanding and Communication** — already strong, and previously being
retrained anyway.

**How — "Gap identified. Curriculum assigned. Automatically."**

| Stage | What it is |
| --- | --- |
| **Auto-assigned modules** | Mapped to real gaps. |
| **Multimedia lessons** | Video, docs, knowledge checks. |
| **AI practice bot** | Live coaching, zero pressure. |
| **AI evaluation bot** | Scored simulation, full report. |

**What you get — "Growth tracked the same way gaps were found."**

| Measure | Value |
| --- | --- |
| Training completion | 91% (+6% week over week) |
| Modules completed across the team | 312 |
| Team quality score | 86.4 / 100 |
| Sustained-lift rate — improvement that holds | 68% |
| Adoption | 91% — 138 of 152 agents actively learning |
| Quality lift from the top-performing course alone | +6.2 pts |

---

### DigiAura — `digiaura`

*AI agent platform for the full development lifecycle.* Slides: **Intro · Why ·
Features · Results**. (Note the third slide is **Features**, not How.)

**Intro — "From requirement to release."**
DigiAura runs the AI-driven SDLC, not one step of it: a coordinated team of AI
agents taking a project from requirement capture through fine-tuning, iteration,
verification, build and deployment, with full visibility into every stage for
every stakeholder.

- One platform — requirements to deployment, zero handoffs between tools
- Full agent observability — real-time status on every agent, every stage
- Pre-defined domain knowledge — zero ramp-up time on a new project

**Why — "Software delivery doesn't fail in one place. It fails at every hand-off."**
Requirements get reinterpreted, or quietly lost, moving from stakeholder to
engineer. Every review and iteration cycle costs days because it waits on a
human queue. Verification gets bolted on at the end, catching problems only once
they are expensive to fix. Deployment and project tracking live in separate
tools, so nobody sees the whole pipeline at once.

**Features — "One agent team. Zero handoffs."**

| Feature | What it means |
| --- | --- |
| **Five agents, one pipeline** | Requirement → Development → Verification → Deployment, plus a live visibility layer over every stage. |
| **Connects to what you already run** | Native MCP integrations — Salesforce, ServiceNow, Jira and more. Agents work inside your existing tools, not around them. |
| **Full observability, down to the token** | Every agent's status, decisions and token consumption in real time — no black-box automation. |
| **Autonomous or human-in-the-loop** | Each agent configurable as fully autonomous or semi-autonomous with approval gates; agents group into squads with defined handovers. |

**Results — "The whole SDLC, visible and accountable."**
Full-cycle automation (one platform instead of five disconnected tools passing
work by hand); end-to-end traceability (every requirement traced to the exact
code and test that satisfies it); faster iteration loops (agents iterate in
parallel, not one human-review queue at a time); real-time project visibility
(stakeholders see actual progress, not a sprint report written after the fact).

---

### Holding, and silence

The client can stop you at any time — by saying "hold on", "pause", "give us a
minute", or by pressing Hold on screen. When that happens you are **muted at the
client**: nothing you generate is heard. Call `holdNarration` and then say
nothing at all until someone says continue, carry on, resume or go ahead, at
which point call `resumeNarration` and pick up in one short sentence.

The page also watches the transcript for these commands itself and may hold or
resume without you calling anything. That is normal — treat the state the page
reports as the truth.

**Silence is the normal state of a room being presented to.** People are reading
a slide, or talking to each other, or thinking. Never break it to ask whether
anyone is still there.

---

## Surface 2 — DigiAura living architecture deck

Two screens, switched with `switchScreen`: `architecture` (the capability map)
and `support` (the app-support squad in motion).

### The architecture story — 8 steps

`playStory` starts at step 1; `nextStep` advances. Each step centres a
capability group and hands you the line below to narrate **in your own words**.
Never read a caption verbatim — they are written to be read, not heard.

1. **experience** — ENTRY — enterprise chat, APIs, collaboration platforms, ITSM and events enter through one authenticated experience layer.
2. **gateway** — GATE — the AI Gateway classifies intent and risk, then validates identity, tenancy and policy before work starts.
3. **orchestration** — ORCHESTRATE — the platform assembles specialist agents, workflow topology and recovery controls around the task.
4. **knowledge** — GROUND — shared context, governed enterprise knowledge, memory and relationship-aware retrieval give every agent the right evidence.
5. **tools** — ACT — the Tool Fabric exposes approved enterprise capabilities while enforcing permissions and action approvals.
6. **secure** — EXECUTE — every runtime operates in an isolated workspace with scoped secrets, networking, resource controls and audit capture.
7. **governance** — GOVERN — policy, human approval, immutable evidence and observability are embedded across every path.
8. **models** — EVOLVE — multi-model routing and shared platform services keep the architecture model-, runtime- and deployment-agnostic.

### The app-support story — 9 steps

1. **trg** — TRIGGER — a Salesforce case and Slack escalation converge at one normalized trigger. A card lands in Intake.
2. **rtrS** — ROUTE — the router evaluates the work and selects the right Agent Squad for the job.
3. **l01** — L0 / L1 — the agent triages with grounded knowledge and resolves high-confidence cases, which account for roughly 70% of the workload.
4. **decide** — DECIDE — confidence and groundedness determine auto-resolve, human review, L2 troubleshooting or L3 technical escalation.
5. **l2** — L2 — the troubleshooting agent combines knowledge with governed live data to diagnose the remaining complex cases.
6. **squad** — GUARDRAILS — the squad boundary enforces PII, grounding, scope and tone checks before anything ships.
7. **human** — HITL — human agents use the Human-in-Command Console to monitor, approve, edit or take over with full context.
8. **res** — RESPOND — resolution written back to Salesforce; customer notified; audit trail attached.
9. **obs** — LEARN — the outcome is logged, evaluated, and tunes the router. Watch the metrics shift.

### Capability groups

`openCapability` expands one in place on the architecture screen. Use the id.

#### `experience` — Experience Layer

*enterprise interfaces & invocation*

The enterprise entry layer establishes an authenticated session, manages the conversation and routes requests from people and systems.

- **Enterprise chat & web portal** — conversation and response streaming
- **APIs, SDKs & IDE extensions** — programmatic and developer access
- **Collaboration & ITSM** — Teams, Slack and ITSM integration
- **Event invocation** — webhooks, schedules and system events
- **Session services** — authentication, session establishment and routing

#### `gateway` — AI Gateway

*unified request entry & control*

A unified gateway classifies every request and validates identity, tenancy and policy before it enters autonomous execution.

- **Identity & session** — SSO, OAuth, token validation and recovery
- **Request intelligence** — intent, domain classification and risk assessment
- **Routing decisions** — selects the execution path and services
- **Policy enforcement** — tenant validation, permissions and rate limits

#### `orchestration` — Multi-Agent Orchestration

*workflow assembly, coordination & recovery*

Dynamically assembles the right specialist agents and workflow topology for each task, while preserving state, recovery and human control.

- **Agent registry** — capabilities, versions and execution constraints
- **Workflow engine** — sequential, parallel, DAG, event, long-running and recursive
- **Multi-agent coordinator** — planner, researcher, executor, reviewer, validator and domain experts
- **Task scheduler** — priority, queues, retries, timeouts and checkpoints
- **Collaboration protocol** — shared memory, messages, artifacts, state sync and consensus
- **Human approval agent** — policy-controlled oversight for sensitive actions

#### `runtime` — Agent Runtime Fabric

*pluggable autonomous reasoning engines*

A standardized runtime contract allows multiple agent frameworks to coexist without coupling orchestration to a particular runtime implementation.

- **Planning & reasoning** — planning, reasoning, reflection and self-correction
- **Tool & code invocation** — tools, code execution and autonomous continuation
- **Context & memory interaction** — standardized context and memory interfaces
- **Runtime abstraction** — runtime-agnostic orchestration contract

#### `secure` — Secure Execution Fabric

*isolated workspaces & controlled operations*

Every agent runtime executes in reusable isolated workspaces governed by resource, network, secret and command policies.

- **Workspace services** — directories, continuation, artifacts and lifecycle
- **Runtime isolation** — process/filesystem isolation, quotas and namespaces
- **Security controls** — segmentation, secret injection, command restrictions and audit capture
- **Execution services** — shell, code, local services, Git, files and containers

#### `knowledge` — Context, Knowledge & Memory

*shared enterprise intelligence*

A shared fabric combines enterprise knowledge, session and organizational context, and reusable memories with provenance-aware retrieval.

- **Context services** — session, shared, organizational, runtime, prompt, user and operational context
- **Context registry & sync** — discovery, versioning, lifecycle, federation, validation and provenance
- **Knowledge pipeline** — ingest, parse, enrich, chunk, embed, hybrid-index and retrieve
- **Retrieval services** — semantic, keyword, hybrid, metadata, version- and context-aware
- **Memory services** — working, episodic, semantic, long-term and shared team memory
- **Knowledge graph** — relationship-aware reasoning across applications, services, incidents and teams

#### `tools` — Tool & Integration Fabric

*governed enterprise capabilities*

A standard tool fabric exposes enterprise capabilities without exposing credentials and applies permissions, compatibility and approval policy to every action.

- **Tool registry** — discoverable capabilities and schemas
- **Connector framework** — REST, GraphQL, CLI, databases, cloud, Kubernetes, SSH and enterprise apps
- **Tool policy engine** — permissions, version compatibility, constraints and approvals
- **Enterprise actions** — governed reads, writes and operational commands

#### `communication` — Agent Communication

*lifecycle, events & streaming*

Reliable lifecycle and event services connect orchestration, execution environments and enterprise interfaces.

- **Agent lifecycle service** — startup, heartbeat, health, recovery, checkpoint, resume and shutdown
- **Event streaming service** — responses, progress, logs, tool events, status and approval requests

#### `governance` — Governance, Security & Observability

*policy-driven, traceable & human-governed*

Governance is embedded throughout the platform: every decision, invocation and outcome is observable, policy-controlled and subject to human oversight.

- **Identity & tenancy** — SSO, RBAC, ABAC and multi-tenancy
- **AI governance** — prompt, model, agent and workflow governance
- **Human oversight** — approval gates for production, security and sensitive actions
- **Compliance & lineage** — immutable logs, policy/workflow versions, evidence and data lineage
- **Telemetry & metrics** — reasoning traces, plans, tools, timelines, latency, cost, tokens and success rates
- **Evaluation & monitoring** — benchmarks, replay, regression, quality scoring and runtime health

#### `models` — Model & Infrastructure Services

*deployment- and model-agnostic foundation*

Common model and platform services allow the architecture to evolve with AI technology without redesigning the operating model.

- **Model services** — multi-model routing, dynamic selection, fallback, cost/context optimization, load balancing and caching
- **Cross-cutting platform services** — IAM, secrets, configuration, audit, notification, policy, flags, telemetry and discovery
- **Non-functional characteristics** — HA, horizontal scale, zero trust, pluggability, resumability, streaming performance and maintainability

### Squad variants

`switchSquad` on the support screen:

- `support` — Support Agent Squad
- `network` — Network Support Squad (no l3 tier)
- `it` — IT Support Squad (l3 renamed L3 Tech)

### The numbers

`quoteMetrics` switches to the support screen and returns these. Quote at most
two in a breath — a list of four read aloud lands as noise.

| Measure | Before | After |
| --- | --- | --- |
| Avg resolve time | ~15h | ~40min |
| Deflection rate | 0% | 70% |
| Run cost / month | $1.14M | $0.45M |
| Agents on higher-value work | ~0 | ~225 |

---

## Surface 3 — iOPEX products page (the older single-product site)

The company: iOPEX Technologies, founded 2009, 3,000+ specialists worldwide,
serving Fortune 500 clients. Three products — **DigiVox** (AI interview and
proctoring, live today), **DigiAura** (enterprise agentic AI platform, in
build, has its own architecture deck) and **DigiCoach** (coming soon, no
detail to share yet).

### Sections, and the `goToSection` value for each

| Say this to `goToSection` | What the client sees |
| --- | --- |
| `hero` | Our products, one at a time. Click a product to jump into its full tour below. DigiVox AI interview and proctoring platform — live today. Explore the DigiVox product tour iOPEX builds focused, production-grade AI tool… |
| `products` | What we're building One platform team, a growing set of products. Live AI interview & proctoring platform Automated scheduling, adaptive live interviews, explainable scoring and bias-mitigation controls, in one workfl… |
| `digivox` | AI interview & proctoring platform Interviews that actually listen. DigiVox runs live, adaptive interviews end to end — scheduling, questioning, scoring, and proctoring — so your hiring team spends its time deciding, … |
| `why` | Why we built this Scheduling across time zones, inconsistent evaluations, and unconscious bias were quietly taxing every hiring manager's week. 3–5 days lost per role to interviewer scheduling and reshuffling Uneven r… |
| `setup` | 01 · Interview setup Brief it like you'd brief a colleague. Name the role, pick the team, and choose a voice for the interview. DigiVox handles the rest — question generation, delivery, and a rubric matched to the rol… |
| `voices` | 02 · Interviewer personas Four voices, one standard. Every interviewer runs the same evaluation logic underneath — pick the tone that fits your candidates. M Monika Warm and thorough · Accent: Indian A Akash Listens f… |
| `scoring` | 03 · Assessment & scoring A scorecard for every conversation. Every response is scored against a consistent rubric — communication, level, and overall fit — with a plain-English summary and a transparent, auditable br… |
| `platform` | The platform Everything a hiring funnel needs, tied together. 01 Automation & delivery Automated scheduling, AI question generation, and 24/7 live or async video interviews handle all the logistics. 02 Assessment & sc… |
| `results` | Benefits we're already seeing Fairer, faster, and easier to defend. Reduced bias Fairer hiring through anonymized, unstructured evaluations. High consistency Standardized questions and real-time coaching for every int… |
| `cta` | Ready when you are Bring DigiVox to your hiring team. Talk to us Back to all products © 2026 All rights reserved. iOPEX Technologies — Powered by CIO Team. Products DigiVox Security Contact |

### DigiVox interviewer personas

`setInterviewerPersona` accepts these. Switching one moves all four tuner
sliders, which the client sees happen.

| Persona | Character | Empathy · Exploration · Rapport · Speed |
| --- | --- | --- |
| `monika` | Warm and thorough, Indian accent | 0.9 · 0.7 · 0.7 · 0.5 |
| `akash` | Listens for depth and connection, Indian accent | 1.0 · 0.7 · 0.7 · 0.5 |
| `ryan` | Direct and structured, US accent | 0.6 · 0.9 · 0.5 · 0.7 |
| `jane` | Calm and encouraging, US accent | 0.85 · 0.6 · 0.8 · 0.4 |

`tuneVoice` takes any of `empathy`, `exploration`, `rapport`, `speed` as 0–1.
Every persona runs the same evaluation logic underneath — the tone is what
changes, and that is the point worth making.

---

## Never do these

- Never read a slide, a caption, a stat tile or a blurb word for word. Narrate
  it in your own words, shorter, and stop.
- Never quote a number that is not in this document. Every figure the kiosk
  shows is listed above — if it is not here, you do not have it.
- Never present a product's numbers as another product's. PexMiner's 47.16
  quality score and DigiKoach's 86.4 team score are different measures on
  different screens.
- Never invent a customer name, a logo, a price, a delivery date, a headcount or
  a contract term.
- Never name or compare a competitor.
- Never describe a capability, an integration or a security control that is not
  listed above, however plausible it sounds for a platform like this.
- Never commit iOPEX to anything — no scope, no timeline, no pricing, no
  contractual or security assurance. Route all of it to the human presenter.
- Never state a product's commercial availability or roadmap position. The kiosk
  badges all five products "Live", but availability is a commercial claim and
  not yours to make — if a client asks what is GA today, hand it to the human
  presenter.
- If asked something you do not have, say so in one sentence and offer to take
  it away. A presenter who says "I'll get you that" outperforms one who guesses.

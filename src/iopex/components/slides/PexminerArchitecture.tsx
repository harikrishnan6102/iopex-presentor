/**
 * Animated tech-architecture diagram for the Pexminer deck — a faithful
 * redraw of the team's architecture image as an inline SVG, so it scales
 * crisply on the 4K kiosk panels and animates: connector lines flow, small
 * packets travel the main pipeline, and the ML service nodes breathe.
 * Ambient animation lives in extras.css under `.pm-arch`.
 */

const INK = 'rgba(236,236,240,0.92)';
const DIM = 'rgba(236,236,240,0.6)';
const MONO = "'JetBrains Mono', monospace";
const SANS = "'Inter', sans-serif";
const LINE = 'rgba(255,255,255,0.32)';
const NODE_FILL = 'rgba(255,255,255,0.045)';
const NODE_STROKE = 'rgba(255,255,255,0.22)';
const EMBER = '#fe5e00';
const GREEN = '#57b87f';
const GREEN_INK = '#a9e6c4';
const DB_STROKE = '#6faa4f';
const DB_FILL = 'rgba(111,170,79,0.08)';
const DB_PILL = 'rgba(111,170,79,0.18)';
const PURPLE = 'rgba(111,102,214,0.38)';

function Node({ x, y, w, h, lines, mono = [], stroke = NODE_STROKE, fill = NODE_FILL, dashed = false, cls }: {
  x: number; y: number; w: number; h: number;
  lines: string[]; mono?: string[];
  stroke?: string; fill?: string; dashed?: boolean; cls?: string;
}) {
  const all = [...lines, ...mono];
  const lh = 15;
  const total = all.length * lh;
  const startY = y + h / 2 - total / 2 + 11;
  return (
    <g className={cls}>
      <rect x={x} y={y} width={w} height={h} rx={9} fill={fill} stroke={stroke} strokeWidth={1.2}
        strokeDasharray={dashed ? '5 5' : undefined} />
      {lines.map((t, i) => (
        <text key={`l${i}`} x={x + w / 2} y={startY + i * lh} textAnchor="middle"
          fontFamily={SANS} fontSize={12.5} fontWeight={600} fill={INK}>{t}</text>
      ))}
      {mono.map((t, i) => (
        <text key={`m${i}`} x={x + w / 2} y={startY + (lines.length + i) * lh} textAnchor="middle"
          fontFamily={MONO} fontSize={10.5} fill={DIM}>{t}</text>
      ))}
    </g>
  );
}

function Pill({ x, y, w, label, d = 0 }: { x: number; y: number; w: number; label: string; d?: number }) {
  return (
    <g className="pill" style={{ ['--d' as string]: `${d}s` }}>
      <rect x={x} y={y} width={w} height={30} rx={6} fill={DB_PILL} stroke={DB_STROKE} strokeOpacity={0.6} strokeWidth={1} />
      <text x={x + w / 2} y={y + 19} textAnchor="middle" fontFamily={MONO} fontSize={9.8} fill={GREEN_INK}>{label}</text>
    </g>
  );
}

function GroupBox({ x, y, w, h, title, bar }: { x: number; y: number; w: number; h: number; title: string; bar: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
      <path d={`M ${x} ${y + 10} q 0 -10 10 -10 h ${w - 20} q 10 0 10 10 v 24 h -${w} z`} fill={bar} />
      <text x={x + w / 2} y={y + 22} textAnchor="middle" fontFamily={SANS} fontSize={13} fontWeight={700} fill={INK}>{title}</text>
    </g>
  );
}

function Db({ x, y, w, h, title, sub }: { x: number; y: number; w: number; h: number; title: string; sub?: string }) {
  const ry = 14;
  return (
    <g>
      <path d={`M ${x} ${y + ry} a ${w / 2} ${ry} 0 0 1 ${w} 0 v ${h - 2 * ry} a ${w / 2} ${ry} 0 0 1 -${w} 0 z`}
        fill={DB_FILL} stroke={DB_STROKE} strokeWidth={1.4} />
      <ellipse cx={x + w / 2} cy={y + ry} rx={w / 2} ry={ry} fill="rgba(111,170,79,0.14)" stroke={DB_STROKE} strokeWidth={1.4} />
      <text x={x + w / 2} y={y + ry + 26} textAnchor="middle" fontFamily={SANS} fontSize={12.5} fontWeight={700} fill={INK}>{title}</text>
      {sub && <text x={x + w / 2} y={y + ry + 42} textAnchor="middle" fontFamily={SANS} fontSize={10.5} fill={DIM}>{sub}</text>}
    </g>
  );
}

/** Elbow connector with flowing dashes + arrowhead. */
function Flow({ d, delay = 0 }: { d: string; delay?: number }) {
  return <path className="flow" d={d} fill="none" stroke={LINE} strokeWidth={1.4}
    markerEnd="url(#pmArrow)" style={{ animationDelay: `${delay}s` }} />;
}

export function PexminerArchitecture() {
  return (
    <div className="pm-arch" data-anim>
      <svg viewBox="0 0 1640 780" role="img" aria-label="Pexminer technical architecture: dashboard and APIs feed uploads into object storage, an ML workflow of locally hosted models scores and segments every interaction, callbacks persist results to PostgreSQL, and analytics dashboards read from it.">
        <defs>
          <marker id="pmArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={LINE} />
          </marker>
        </defs>

        {/* ---------------- col 1 — access ---------------- */}
        <Node x={20} y={30} w={210} h={48} lines={['Web Dashboard']} stroke="rgba(120,180,255,0.5)" />
        <Node x={20} y={122} w={210} h={54} lines={['API Gateway', '(DRF Router)']} />
        <Node x={20} y={220} w={210} h={72} lines={['Auth Layer']} mono={['/api/token/', '/auth/google/']} stroke="rgba(254,94,0,0.55)" />
        <Node x={20} y={336} w={210} h={54} lines={['(DB Check)', 'PostgreSQL Users']} />
        <Flow d="M 125 78 V 116" />
        <Flow d="M 125 176 V 214" delay={0.2} />
        <Flow d="M 125 292 V 330" delay={0.4} />

        {/* auth -> backend group */}
        <Flow d="M 230 256 H 268" delay={0.6} />

        {/* ---------------- group 2 — backend setup & upload ---------------- */}
        <GroupBox x={270} y={30} w={400} h={710} title="⚙️ Backend Setup & Upload APIs" bar="rgba(242,102,28,0.3)" />
        <Node x={292} y={96} w={168} h={54} lines={['Project']} mono={['/project']} />
        <Node x={292} y={192} w={168} h={54} lines={['Team']} mono={['/team']} />
        <Node x={292} y={288} w={168} h={54} lines={['User / Roles']} mono={['/user']} />
        <Node x={292} y={384} w={168} h={54} lines={['Quality Config']} mono={['/quality']} stroke="rgba(214,80,120,0.6)" />
        <Flow d="M 376 150 V 186" delay={0.1} />
        <Flow d="M 376 246 V 282" delay={0.3} />
        <Flow d="M 376 342 V 378" delay={0.5} />

        <Node x={482} y={96} w={168} h={54} lines={['Media Upload']} mono={['/file_upload']} stroke="rgba(254,94,0,0.55)" />
        <Node x={482} y={186} w={168} h={46} lines={['MINIO Object Storage']} mono={['/cluster']} />
        <Flow d="M 566 150 V 180" delay={0.2} />

        <Db x={486} y={262} w={160} h={230} title="PostgreSQL DB" sub="File metadata" />
        <Pill x={496} y={344} w={140} label="FileMaster" d={0.4} />
        <Pill x={496} y={386} w={140} label="AudioTranscriptAudit" d={2.2} />
        <Pill x={496} y={428} w={140} label="AudioTranscript" d={4.0} />
        <Flow d="M 566 232 V 256" delay={0.4} />

        <Node x={352} y={646} w={230} h={52} lines={['▶ Trigger Eval']} mono={['/evaluation']} stroke="rgba(254,94,0,0.65)" cls="svc" />
        <Flow d="M 376 438 V 672 H 346" delay={0.1} />
        <Flow d="M 566 492 V 640" delay={0.3} />

        {/* trigger -> ML group */}
        <Flow d="M 582 672 H 700 V 130 H 726" delay={0.5} />

        {/* ---------------- group 3 — ML workflow & callbacks ---------------- */}
        <GroupBox x={720} y={30} w={520} h={710} title="🤖 ML Workflow & Callbacks" bar={PURPLE} />
        <Node x={740} y={96} w={300} h={62} lines={['Diarization & Transcription', '(Whisper-large-V3 & NeMo)']} stroke="rgba(120,180,255,0.5)" cls="svc" />
        <Node x={740} y={206} w={300} h={62} lines={['Quality Service', '(Locally hosted Qwen3-4B & Qwen2-Audio-7B)']} cls="svc" />
        <Node x={740} y={316} w={300} h={56} lines={['Segmentation Service', '(Locally hosted Qwen3-4B)']} cls="svc" />
        <Node x={740} y={420} w={300} h={56} lines={['Sentiment Service', '(Locally hosted Qwen3-4B)']} cls="svc" />
        <Node x={740} y={524} w={300} h={72} lines={['Escalation Detection & Transaction', 'Summarization Service', '(Locally hosted Qwen3-4B)']} cls="svc" />
        <Flow d="M 890 158 V 200" delay={0.15} />
        <Flow d="M 890 268 V 310" delay={0.35} />
        <Flow d="M 890 372 V 414" delay={0.55} />
        <Flow d="M 890 476 V 518" delay={0.75} />

        <Node x={1074} y={104} w={148} h={44} lines={['Diarization Callback']} stroke={GREEN} dashed cls="cbn" />
        <Node x={1074} y={214} w={148} h={44} lines={['Segmentation Callback']} stroke={GREEN} dashed cls="cbn" />
        <Node x={1074} y={322} w={148} h={44} lines={['Sentiment Callback']} stroke={GREEN} dashed cls="cbn" />
        <Node x={1074} y={426} w={148} h={44} lines={['Quality Callback']} stroke={GREEN} dashed cls="cbn" />
        <Node x={1074} y={538} w={148} h={44} lines={['Escalation Callback']} stroke={GREEN} dashed cls="cbn" />
        <Flow d="M 1040 127 H 1068" delay={0.2} />
        <Flow d="M 1040 237 H 1068" delay={0.4} />
        <Flow d="M 1040 344 H 1068" delay={0.6} />
        <Flow d="M 1040 448 H 1068" delay={0.8} />
        <Flow d="M 1040 560 H 1068" delay={1.0} />

        {/* ---------------- col 4 — postgres results DB ---------------- */}
        <Db x={1290} y={60} w={190} h={420} title="🗄 PostgreSQL DB" />
        <Pill x={1302} y={166} w={166} label="AudioTranscriptAudit" d={1.0} />
        <Pill x={1302} y={222} w={166} label="AudioTranscriptSegregation" d={2.5} />
        <Pill x={1302} y={278} w={166} label="AudioTranscriptQualityScore" d={4.0} />
        <Pill x={1302} y={334} w={166} label="QualityScoreMoment" d={5.5} />
        <Flow d="M 1222 127 H 1260 V 183 H 1296" delay={0.25} />
        <Flow d="M 1222 237 H 1296 V 239" delay={0.45} />
        <Flow d="M 1222 344 H 1260 V 295 H 1296" delay={0.65} />
        <Flow d="M 1222 448 H 1268 V 351 H 1296" delay={0.85} />
        <Flow d="M 1222 560 H 1276 V 368 H 1296" delay={1.05} />

        {/* ---------------- group 5 — analytics ---------------- */}
        <GroupBox x={1440} y={520} w={180} h={220} title="📊 Analytics & Reporting" bar={PURPLE} />
        <Node x={1456} y={578} w={148} h={44} lines={['📶 Dashboards']} />
        <Node x={1456} y={634} w={148} h={44} lines={['🧠 Insights']} stroke={GREEN} />
        <Node x={1456} y={690} w={148} h={40} lines={['📄 Reports']} />
        <Flow d="M 1385 466 V 600 H 1450" delay={0.5} />
        <Flow d="M 1385 466 V 656 H 1450" delay={0.7} />
        <Flow d="M 1385 466 V 710 H 1450" delay={0.9} />

        {/* blinking status dots on the callbacks */}
        {[127, 237, 344, 448, 560].map((cy, i) => (
          <circle key={`dot${i}`} className="cbdot" cx={1214} cy={cy} r={3.2} fill={GREEN}
            style={{ ['--d' as string]: `${i * 0.55}s` }} />
        ))}

        {/* ---------------- traveling packets on the main pipeline ---------------- */}
        <circle className="pkt" r={4} fill={EMBER}>
          <animateMotion dur="6s" repeatCount="indefinite"
            path="M 125 54 V 250 H 376 V 672 H 582" />
        </circle>
        <circle className="pkt" r={4} fill={EMBER}>
          <animateMotion dur="5s" begin="1.2s" repeatCount="indefinite"
            path="M 582 672 H 700 V 130 H 890 V 560 H 1068" />
        </circle>
        <circle className="pkt" r={4} fill={GREEN}>
          <animateMotion dur="4.5s" begin="0.6s" repeatCount="indefinite"
            path="M 1222 127 H 1260 V 183 H 1296" />
        </circle>
        <circle className="pkt" r={4} fill={GREEN}>
          <animateMotion dur="5.5s" begin="2s" repeatCount="indefinite"
            path="M 1385 466 V 600 H 1450" />
        </circle>
        {/* constant service -> callback traffic, one hop per service, staggered */}
        {([[127, 0], [237, 0.4], [344, 0.8], [448, 1.2], [560, 1.6]] as const).map(([cy, b], i) => (
          <circle key={`hop${i}`} className="pkt" r={3.4} fill={EMBER}>
            <animateMotion dur="2s" begin={`${b}s`} repeatCount="indefinite" path={`M 1040 ${cy} H 1068`} />
          </circle>
        ))}
        {/* more callback -> DB writes */}
        <circle className="pkt" r={4} fill={GREEN}>
          <animateMotion dur="4s" begin="1.6s" repeatCount="indefinite" path="M 1222 237 H 1296" />
        </circle>
        <circle className="pkt" r={4} fill={GREEN}>
          <animateMotion dur="5s" begin="3s" repeatCount="indefinite" path="M 1222 448 H 1268 V 351 H 1296" />
        </circle>
        {/* upload chain + auth handoff + reports feed */}
        <circle className="pkt" r={3.4} fill={EMBER}>
          <animateMotion dur="2.4s" begin="0.8s" repeatCount="indefinite" path="M 566 150 V 180" />
        </circle>
        <circle className="pkt" r={3.4} fill={EMBER}>
          <animateMotion dur="2.4s" begin="2s" repeatCount="indefinite" path="M 566 232 V 256" />
        </circle>
        <circle className="pkt" r={3.4} fill={EMBER}>
          <animateMotion dur="2s" begin="1.4s" repeatCount="indefinite" path="M 230 256 H 268" />
        </circle>
        <circle className="pkt" r={4} fill={GREEN}>
          <animateMotion dur="6s" begin="3.4s" repeatCount="indefinite" path="M 1385 466 V 710 H 1450" />
        </circle>
      </svg>
    </div>
  );
}

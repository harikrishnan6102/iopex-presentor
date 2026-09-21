import type { CSSProperties, ReactNode } from 'react';

/** A screenshot in a fake window frame (traffic-light bar + image). */
export function ShotFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="shot-frame">
      <div className="fbar"><span /><span /><span /></div>
      <img src={src} alt={alt} loading="lazy" />
    </div>
  );
}

/** Mouse-tilting card wrapping a ShotFrame (data-tilt + data-anim reveal). */
export function TiltShot({ src, alt, anim = true, children }: { src: string; alt: string; anim?: boolean; children?: ReactNode }) {
  return (
    <div className="tilt-card" data-tilt {...(anim ? { 'data-anim': true } : {})} style={{ position: 'relative' }}>
      <ShotFrame src={src} alt={alt} />
      {children}
    </div>
  );
}

/** Two overlapping screenshots that trade places on a 9s loop. */
export function ReportShots({ a, b, anim = true }: { a: { src: string; alt: string }; b: { src: string; alt: string }; anim?: boolean }) {
  return (
    <div className="dk-report-shots" {...(anim ? { 'data-anim': true } : {})}>
      <div className="dk-report-shot shot-a"><ShotFrame src={a.src} alt={a.alt} /></div>
      <div className="dk-report-shot shot-b"><ShotFrame src={b.src} alt={b.alt} /></div>
    </div>
  );
}

export function PainCard({ title, children }: { title: ReactNode; children: ReactNode }) {
  return <div className="pain-card"><b>{title}</b><span>{children}</span></div>;
}

export function Stat({ count, suffix = '', value, children }: { count?: number; suffix?: string; value?: string; children: ReactNode }) {
  return (
    <div className="stat">
      {count !== undefined
        ? <b className="mono" data-count={count} data-suffix={suffix}>0</b>
        : <b className="mono">{value}</b>}
      <span>{children}</span>
    </div>
  );
}

export function Eyebrow({ tone, children, style }: { tone: 'ember' | 'gold' | 'insight'; children: ReactNode; style?: CSSProperties }) {
  return <div className={`eyebrow ${tone}`} style={style}><i />{children}</div>;
}

export const mt = (px: number): CSSProperties => ({ marginTop: px });

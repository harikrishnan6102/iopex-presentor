/**
 * Product catalogue — the single source of truth for the home carousel, the
 * hero rotator, the per-product camera drift and the voice tools.
 */
export type ProductId = 'elevaite' | 'digivox' | 'pexminer' | 'digikoach' | 'digiaura';

export interface Product {
  id: ProductId;
  badge: 'live' | 'dev';
  badgeText: string;
  title: string;
  /** Spoken / narrated name used by the voice guide. */
  spokenName: string;
  tagline: string;
  img: string;
  logo: string;
  page: ProductId;
  accentA: string;
  accentB: string;
}

export const PRODUCTS: Product[] = [
  {
    id: 'elevaite', badge: 'live', badgeText: 'Live', title: 'elevAIte', spokenName: 'ElevAIte',
    tagline: 'Build, deploy, and run AI agents — on any stack.',
    img: 'https://aurora.growatiopex.com/sites/default/files/2026-09/elevate_screenshot.png',
    logo: 'https://aurora.growatiopex.com/sites/default/files/2026-09/elevaite_logo_negative.png',
    page: 'elevaite', accentA: '--iopex', accentB: '--iopex-2',
  },
  {
    id: 'digivox', badge: 'live', badgeText: 'Live', title: 'DigiVox', spokenName: 'DigiVox',
    tagline: 'An AI agent that interviews, screens, and ranks — for you.',
    img: 'https://aurora.growatiopex.com/sites/default/files/2026-09/digivox-homescreen.png',
    logo: 'https://aurora.growatiopex.com/sites/default/files/2026-09/Digivox-logo-white_updated%20%282%29.png',
    page: 'digivox', accentA: '--ember', accentB: '--gold',
  },
  {
    id: 'pexminer', badge: 'live', badgeText: 'Live', title: 'Pexminer', spokenName: 'PexMiner',
    tagline: 'AI agents that review every call and chat — all of them.',
    img: 'https://aurora.growatiopex.com/sites/default/files/2026-09/Chatbot.png',
    logo: 'https://aurora.growatiopex.com/sites/default/files/2026-09/pexminer_logo.png',
    page: 'pexminer', accentA: '--insight', accentB: '--iopex-2',
  },
  {
    id: 'digikoach', badge: 'live', badgeText: 'Live', title: 'DigiKoach', spokenName: 'DigiKoach',
    tagline: 'An AI agent that coaches every rep, automatically.',
    img: 'https://aurora.growatiopex.com/sites/default/files/2026-09/Agent-practice_Lab.png',
    logo: 'https://aurora.growatiopex.com/sites/default/files/2026-09/digikoauch_logo.png',
    page: 'digikoach', accentA: '--scan', accentB: '--gold',
  },
  {
    id: 'digiaura', badge: 'live', badgeText: 'Live', title: 'DigiAura', spokenName: 'DigiAura',
    tagline: 'AI agents that carry your project from spec to shipped.',
    img: 'https://aurora.growatiopex.com/sites/default/files/2026-09/Screenshot%202026-09-12%20at%201.04.18%E2%80%AFPM.png',
    logo: 'https://aurora.growatiopex.com/sites/default/files/2026-09/Digiaura%20logo.png',
    page: 'digiaura', accentA: '--iopex-2', accentB: '--scan',
  },
];

export const PRODUCT_IDS: ProductId[] = PRODUCTS.map((p) => p.id);

export const PRODUCTS_BY_ID: Record<ProductId, Product> = PRODUCTS.reduce(
  (acc, p) => { acc[p.id] = p; return acc; },
  {} as Record<ProductId, Product>,
);

export function isProductId(v: string): v is ProductId {
  return (PRODUCT_IDS as string[]).includes(v);
}

/** Screenshots whose UI is light-themed, so the fake window bar goes light too. */
export const LIGHT_THEME_PRODUCTS: Partial<Record<ProductId, boolean>> = {
  digivox: true, digikoach: true, pexminer: true,
};

/**
 * Cinematic per-product camera signature — the live Three.js camera drifts
 * with its own personality per product during the hero and the attract loop.
 */
export interface CamDrift { rx: number; ry: number; speed: number }
export const CAM_DRIFT_BY_PRODUCT: Record<ProductId, CamDrift> = {
  digivox:   { rx: 0.32, ry: 0.16, speed: 1.00 },
  elevaite:  { rx: 0.46, ry: 0.22, speed: 0.80 },
  digikoach: { rx: 0.28, ry: 0.30, speed: 1.15 },
  pexminer:  { rx: 0.40, ry: 0.14, speed: 0.90 },
  digiaura:  { rx: 0.34, ry: 0.26, speed: 1.05 },
};

/** Rotation order of the hero banner — matches the carousel's product order. */
export const HERO_SLIDE_ORDER: ProductId[] = ['elevaite', 'digivox', 'pexminer', 'digikoach', 'digiaura'];

export interface HeroSlide { id: ProductId; logo: string; alt: string; title: string; lede: string }
/** DOM order of the hero slides (kept as in the original markup). */
export const HERO_SLIDES: HeroSlide[] = [
  { id: 'digivox', logo: PRODUCTS_BY_ID.digivox.logo, alt: 'DigiVox', title: 'Better hires. Faster. Every time.',
    lede: 'DigiVox screens every candidate against a standardized rubric — no bias, no bottlenecks, no waiting weeks for a callback.' },
  { id: 'elevaite', logo: PRODUCTS_BY_ID.elevaite.logo, alt: 'elevAIte', title: 'Agents that act, not just answer.',
    lede: 'One platform to build, run, and scale AI agents across your stack — Salesforce to ServiceNow, any LLM, on-prem or cloud.' },
  { id: 'digikoach', logo: PRODUCTS_BY_ID.digikoach.logo, alt: 'DigiKoach', title: 'Coaching that starts at the real gap.',
    lede: 'DigiKoach finds every agent’s weak spot and builds the fix — automatically, from real performance data.' },
  { id: 'pexminer', logo: PRODUCTS_BY_ID.pexminer.logo, alt: 'Pexminer', title: 'Every call. Every chat. Actually reviewed.',
    lede: '100% of your voice and chat interactions — transcribed, scored, analyzed. No sampling.' },
  { id: 'digiaura', logo: PRODUCTS_BY_ID.digiaura.logo, alt: 'DigiAura', title: 'Spec to shipped. Zero handoffs.',
    lede: 'DigiAura’s AI agents carry your project from spec to deployment — full visibility, every stage, every stakeholder.' },
];

/**
 * Swap the shared --accent-a/--accent-b custom properties to this product's
 * pair — every element reading them (carousel dots, current product-link pill,
 * the centred card's glow) re-colours itself automatically.
 */
export function applyProductAccent(p: Product): void {
  const root = document.documentElement.style;
  root.setProperty('--accent-a', `var(${p.accentA})`);
  root.setProperty('--accent-b', `var(${p.accentB})`);
}

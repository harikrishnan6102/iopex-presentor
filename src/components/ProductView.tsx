import type { ProductId } from '../data/products';
import SlideDeck from './deck/SlideDeck';
import type { SlideDef } from './deck/SlideDef';
import { DIGIVOX_SLIDES } from './slides/DigiVoxSlides';
import { ELEVAITE_SLIDES } from './slides/ElevAIteSlides';
import { DIGIKOACH_SLIDES } from './slides/DigiKoachSlides';
import { PEXMINER_SLIDES } from './slides/PexminerSlides';
import { DIGIAURA_SLIDES } from './slides/DigiAuraSlides';

const A = 'https://aurora.growatiopex.com/sites/default/files/2026-09/';

const DECKS: Record<ProductId, { prefix: string; slides: SlideDef[]; logo: string }> = {
  digivox:   { prefix: 'k',  slides: DIGIVOX_SLIDES,   logo: `${A}Digivox-logo-white_updated%20%282%29.png` },
  elevaite:  { prefix: 'ev', slides: ELEVAITE_SLIDES,  logo: `${A}elevaite_logo_negative.png` },
  digikoach: { prefix: 'dk', slides: DIGIKOACH_SLIDES, logo: `${A}digikoauch_logo.png` },
  pexminer:  { prefix: 'pm', slides: PEXMINER_SLIDES,  logo: `${A}pexminer_logo.png` },
  digiaura:  { prefix: 'da', slides: DIGIAURA_SLIDES,  logo: `${A}Digiaura%20logo.png` },
};

/** Labels per product, for the voice tools (no DOM needed). */
export function slideLabelsFor(id: ProductId): string[] {
  return DECKS[id].slides.map((s) => s.label);
}

export default function ProductView({ product }: { product: ProductId }) {
  const deck = DECKS[product];
  // key forces a fresh deck (first slide, no leftover transition classes) per product
  return <SlideDeck key={product} product={product} prefix={deck.prefix} slides={deck.slides} logo={deck.logo} />;
}

import type { ProductId } from '../data/products';
import SlideDeck from './deck/SlideDeck';
import type { SlideDef } from './deck/SlideDef';
import { DIGIVOX_SLIDES } from './slides/DigiVoxSlides';
import { ELEVAITE_SLIDES } from './slides/ElevAIteSlides';
import { DIGIKOACH_SLIDES } from './slides/DigiKoachSlides';
import { PEXMINER_SLIDES } from './slides/PexminerSlides';
import { DIGIAURA_SLIDES } from './slides/DigiAuraSlides';

const DECKS: Record<ProductId, { prefix: string; slides: SlideDef[] }> = {
  digivox:   { prefix: 'k',  slides: DIGIVOX_SLIDES },
  elevaite:  { prefix: 'ev', slides: ELEVAITE_SLIDES },
  digikoach: { prefix: 'dk', slides: DIGIKOACH_SLIDES },
  pexminer:  { prefix: 'pm', slides: PEXMINER_SLIDES },
  digiaura:  { prefix: 'da', slides: DIGIAURA_SLIDES },
};

/** Labels per product, for the voice tools (no DOM needed). */
export function slideLabelsFor(id: ProductId): string[] {
  return DECKS[id].slides.map((s) => s.label);
}

export default function ProductView({ product }: { product: ProductId }) {
  const deck = DECKS[product];
  // key forces a fresh deck (first slide, no leftover transition classes) per product
  return <SlideDeck key={product} product={product} prefix={deck.prefix} slides={deck.slides} />;
}

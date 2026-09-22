import type { ReactNode } from 'react';

export interface SlideDef {
  /** Chip label in the bottom bar (Intro / Why / How / …). */
  label: string;
  /** Section id, e.g. "dv-why". Optional for the intro slide. */
  id?: string;
  /** Extra classes on the <section>, e.g. "dv-intro". */
  className?: string;
  content: ReactNode;
}

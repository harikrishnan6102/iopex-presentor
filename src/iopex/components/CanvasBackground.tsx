import { useEffect, useRef } from 'react';
import { ParticleScene } from '../scene/ParticleScene';
import { controller, anyProductOpen } from '../kiosk/controller';

/** The fixed Three.js backdrop behind everything — home view and every deck. */
export default function CanvasBackground() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scene = new ParticleScene({
      container: el,
      isProductOpen: anyProductOpen,
      onSplit: (split) => controller.carousel?.onSplit(split),
    });
    const unregister = controller.registerScene({
      setProductDrift: (id) => scene.setProductDrift(id),
      replayFormation: () => scene.replayFormation(),
    });
    return () => {
      unregister();
      scene.destroy();
    };
  }, []);

  return <div id="canvas-container" ref={ref} />;
}

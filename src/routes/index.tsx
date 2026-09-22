import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";

import "@/iopex/styles/global.css";
import "@/iopex/styles/extras.css";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "iOPEX Products — AI products built by iOPEX Technologies" },
      {
        name: "description",
        content:
          "The iOPEX products kiosk: elevAIte, DigiVox, Pexminer, DigiKoach and DigiAura, presented with a voice guide and gesture controls.",
      },
      {
        property: "og:title",
        content: "iOPEX Products — AI products built by iOPEX Technologies",
      },
      {
        property: "og:description",
        content:
          "Explore the iOPEX product portfolio through an interactive kiosk with a voice guide and gesture controls.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  // The kiosk (Three.js scene, voice guide, gesture layer) is browser-only,
  // so it is loaded on the client after hydration.
  const [App, setApp] = useState<ComponentType | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@/iopex/App").then((mod) => {
      if (!cancelled) setApp(() => mod.default);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!App) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a10",
          color: "#989ea7",
          fontFamily: "'Space Grotesk', sans-serif",
          letterSpacing: "0.08em",
        }}
      >
        Loading iOPEX Presenter…
      </div>
    );
  }

  return <App />;
}

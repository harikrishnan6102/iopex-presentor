/**
 * Public ElevenLabs agent id. Not a secret — it ships in the page either way.
 * Resolution order: ?agent=agent_xxx → window.IOPEX_VOICE_AGENT_ID →
 * VITE_ELEVENLABS_AGENT_ID (.env) → the id from the original products page.
 */
export function resolveAgentId(): string {
  return (
    new URLSearchParams(location.search).get('agent') ||
    window.IOPEX_VOICE_AGENT_ID ||
    import.meta.env.VITE_ELEVENLABS_AGENT_ID ||
    'agent_8601m25e1gmdft09d3vy3ft6bq94'
  );
}

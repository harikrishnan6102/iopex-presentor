import type { KioskController } from './kiosk/controller';
import type { VoiceAgentHandle } from './voice/voiceAgent';
import type { GestureEngineHandle } from './gesture/gestureEngine';

declare global {
  interface Window {
    IopexKiosk?: KioskController;
    IopexVoice?: VoiceAgentHandle;
    IopexGesture?: GestureEngineHandle;
    IOPEX_VOICE_AGENT_ID?: string;
    /** Access code, if you would rather set it in index.html than at build time. */
    IOPEX_ACCESS_CODE?: string;
    IopexAccess?: { lock(): void; isUnlocked(): boolean };
    IOPEX_VOICE_DEBUG?: boolean;
  }
  interface Navigator {
    /** Chromium-only hint, used by the low-power device heuristic. */
    deviceMemory?: number;
  }
}

export {};

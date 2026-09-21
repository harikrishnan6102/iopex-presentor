import { useEffect, useRef, useState, type FormEvent } from 'react';
import { tryUnlock } from './accessCode';

/**
 * The access code prompt, shown when someone taps "Ask the guide" while the
 * kiosk is locked. The site itself stays open — what costs money is the voice
 * session, so that is what the code stands in front of.
 *
 * Resolves through `onDone`: true once the right code is entered, false if the
 * person backs out. The voice agent's beforeStart hook awaits that answer.
 */
export default function AccessGate({ onDone }: { onDone: (ok: boolean) => void }) {
  const [wrong, setWrong] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onDone(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (tryUnlock(inputRef.current?.value || '')) { onDone(true); return; }
    setWrong(true);
    if (inputRef.current) { inputRef.current.value = ''; inputRef.current.focus(); }
  };

  return (
    <div className="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title" onClick={() => onDone(false)}>
      <form className={`gate-card${wrong ? ' is-wrong' : ''}`} onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
        <p className="gate-brand mono">iOPEX Guide</p>
        <h1 className="gate-title" id="gate-title">Enter the access code</h1>
        <p className="gate-lede">The voice guide runs a live session. Everything else on the kiosk stays open without a code.</p>
        <input
          ref={inputRef}
          className="gate-input mono"
          type="password"
          name="access-code"
          autoComplete="off"
          spellCheck={false}
          aria-label="Access code"
          aria-invalid={wrong}
          onChange={() => wrong && setWrong(false)}
        />
        <button className="gate-go" type="submit">Start the guide</button>
        <button className="gate-cancel" type="button" onClick={() => onDone(false)}>Not now</button>
        <p className="gate-msg" role="status">{wrong ? 'That code is not right.' : 'Ask the iOPEX team for the code.'}</p>
      </form>
    </div>
  );
}

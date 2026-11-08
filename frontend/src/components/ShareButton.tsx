'use client';

import { useEffect, useRef, useState } from 'react';

interface ShareButtonProps {
  /** Builds the link to copy (called on click, so it reflects the current view). */
  getUrl: () => string;
}

type Status = 'idle' | 'copied' | 'failed';

const STATUS_TEXT: Record<Status, string> = {
  idle: '',
  copied: 'Link copied',
  failed: 'Copy failed: use the address bar',
};

/** Copy text, falling back to a hidden textarea where the Clipboard API is unavailable. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

/** Quiet icon button that copies a link to the current view. */
export default function ShareButton({ getUrl }: ShareButtonProps) {
  const [status, setStatus] = useState<Status>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const share = async () => {
    const ok = await copyText(getUrl());
    setStatus(ok ? 'copied' : 'failed');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus('idle'), 2500);
  };

  return (
    <span className="share-control">
      <span className="share-status" role="status" aria-live="polite">
        {STATUS_TEXT[status]}
      </span>
      <button
        type="button"
        className="share-btn"
        onClick={share}
        aria-label="Share: copy a link to this view"
        title="Copy a link to this view"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
          <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
        </svg>
        <span>Share</span>
      </button>
    </span>
  );
}

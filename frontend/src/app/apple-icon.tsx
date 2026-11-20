import { ImageResponse } from 'next/og';

// iOS home-screen icon: the favicon (icon.svg) drawn at 180x180, since iOS
// ignores SVG icons. Full-bleed: iOS rounds the corners itself.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#f0fdfa' }}>
        <svg width="180" height="180" viewBox="0 0 32 32" fill="none">
          <path d="M7 8v17h18" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 21l4.5-5 3.5 3 6-8" stroke="#0f766e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}

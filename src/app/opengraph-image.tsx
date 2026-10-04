import { ImageResponse } from 'next/og';

export const alt = 'HEATSYNC — Sense the heat. Sync the response.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Social card in the HEATSYNC palette: Midnight Blue ground, Soft Bright Gray type, Silver and Wet Asphalt accents. */
export default function OpengraphImage() {
  const stats = [
    ['45.8 °C', 'Nagpur, 26 May 2024'],
    ['19 / 36', 'districts ≥ 40 °C'],
    ['8', 'data structures'],
  ];
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background: 'radial-gradient(circle at 20% 15%, #33495d 0%, #2c3d50 45%, #1a2531 100%)',
          color: '#ecf0f1',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 22, letterSpacing: 6, color: '#bdc3c7' }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: '#ecf0f1' }} />
          HEATWAVE RESPONSE ENGINE · MAHARASHTRA
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 168, fontWeight: 900, letterSpacing: -6, lineHeight: 1 }}>HEATSYNC</div>
          <div style={{ display: 'flex', fontSize: 40, marginTop: 18, color: '#bdc3c7' }}>
            Sense the heat. <span style={{ color: '#ecf0f1', marginLeft: 12 }}>Sync the response.</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {stats.map(([v, l], i) => (
            <div
              key={l}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '20px 28px',
                borderRadius: 24,
                background: i === 0 ? '#ecf0f1' : i === 1 ? '#bdc3c7' : '#33495d',
                color: i < 2 ? '#2c3d50' : '#ecf0f1',
              }}
            >
              <div style={{ fontSize: 40, fontWeight: 900 }}>{v}</div>
              <div style={{ fontSize: 20, opacity: 0.8 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}

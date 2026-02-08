import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'CompeteMath'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  // 1. Establish the URL
  // We prioritize the hardcoded domain to avoid Vercel preview URL issues
  // But fallback to VERCEL_URL if needed.
  const host = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:3000'
  
  const bgImageUrl = `${host}/images/backgrounds/train.png`

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          height: '100%',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          backgroundColor: '#0f172a', // Fallback color (Slate-900)
          fontFamily: 'serif',
          position: 'relative', // Needed for absolute positioning children
        }}
      >
        {/* FIX: Use an <img /> tag instead of CSS backgroundImage.
           This is much more robust on Vercel's Edge network.
        */}
        <img
          src={bgImageUrl}
          alt="Background"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 0, // Sit at the back
          }}
        />

        {/* Dark Overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.7)', 
            zIndex: 1, // Sit on top of image
          }}
        />

        {/* Text Content */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10 }}>
          <p style={{ 
            fontSize: 90, 
            fontWeight: 900,
            margin: 0,
            backgroundImage: 'linear-gradient(to right, #fcd34d, #fef08a, #fbbf24)', 
            backgroundClip: 'text',
            color: 'transparent',
            textShadow: '0 0 5px #fef08a, 0 0 15px #fbbf24, 0 0 35px rgba(217, 119, 6, 0.8)',
          }}>
            CompeteMath
          </p>
          <p style={{ 
            fontSize: 28, 
            color: '#e2e8f0', 
            marginTop: 5,
            fontWeight: 600,
            letterSpacing: '1px',
            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}>
            Discover the Beauty of Math
          </p>
        </div>
      </div>
    ),
    { ...size }
  )
}
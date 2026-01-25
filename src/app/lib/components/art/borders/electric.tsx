import React from 'react';

export default function ElectricBorderCard() {
  return (
    <div className="electric-card-wrapper">
      <style>{`
        /* Scoped Variables & Base Styles */
        .electric-card-wrapper {
          --electric-border-color: #c0c0c0;
          --electric-light-color: oklch(from var(--electric-border-color) l c h);
          --gradient-color: oklch(from var(--electric-border-color) 0.3 calc(c / 2) h / 0.4);
          --color-neutral-900: oklch(0.185 0 0);
          --silver-bright: #e8e8e8;
          --silver-medium: #a8a8a8;
          --silver-dark: #808080;
          
          /* Layout & Font defaults for this component */
          font-family: system-ui, -apple-system, sans-serif;
          background-color: oklch(0.145 0 0);
          color: oklch(0.985 0 0);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh; /* Adjust or remove if you don't want it full screen */
          width: 100%;
          overflow: hidden;
          position: relative;
        }

        .electric-card-wrapper * {
          box-sizing: border-box;
        }

        /* SVG positioning */
        .svg-container {
          position: absolute;
          width: 0;
          height: 0;
          pointer-events: none;
        }

        /* Card container */
        .card-container {
          padding: 2px;
          border-radius: 24px;
          position: relative;
          background: linear-gradient(-30deg, var(--gradient-color), transparent, var(--gradient-color)),
            linear-gradient(to bottom, var(--color-neutral-900), var(--color-neutral-900));
          box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        }

        /* Inner container */
        .inner-container {
          position: relative;
        }

        /* Border layers */
        .border-outer {
          border: 2px solid rgba(192, 192, 192, 0.5);
          border-radius: 24px;
          padding-right: 4px;
          padding-bottom: 4px;
        }

        .main-card {
          width: 350px;
          height: 500px;
          border-radius: 24px;
          border: 2px solid var(--electric-border-color);
          margin-top: -4px;
          margin-left: -4px;
          filter: url(#turbulent-displace);
        }

        /* Glow effects */
        .glow-layer-1 {
          border: 2px solid rgba(192, 192, 192, 0.6);
          border-radius: 24px;
          width: 100%;
          height: 100%;
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          filter: blur(1px);
          pointer-events: none;
        }

        .glow-layer-2 {
          border: 2px solid var(--electric-light-color);
          border-radius: 24px;
          width: 100%;
          height: 100%;
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          filter: blur(4px);
          pointer-events: none;
        }

        /* Overlay effects */
        .overlay-1 {
          position: absolute;
          width: 100%;
          height: 100%;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border-radius: 24px;
          opacity: 1;
          mix-blend-mode: overlay;
          transform: scale(1.1);
          filter: blur(16px);
          background: linear-gradient(-30deg, white, transparent 30%, transparent 70%, white);
          pointer-events: none;
        }

        .overlay-2 {
          position: absolute;
          width: 100%;
          height: 100%;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border-radius: 24px;
          opacity: 0.5;
          mix-blend-mode: overlay;
          transform: scale(1.1);
          filter: blur(16px);
          background: linear-gradient(-30deg, white, transparent 30%, transparent 70%, white);
          pointer-events: none;
        }

        /* Background glow */
        .background-glow {
          position: absolute;
          width: 100%;
          height: 100%;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border-radius: 24px;
          filter: blur(32px);
          transform: scale(1.1);
          opacity: 0.3;
          z-index: -1;
          background: linear-gradient(-30deg, var(--silver-bright), transparent, var(--electric-border-color));
          pointer-events: none;
        }

        /* Content container */
        .content-container {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          z-index: 10;
        }

        /* Content sections */
        .content-top {
          display: flex;
          flex-direction: column;
          padding: 48px;
          padding-bottom: 16px;
          height: 100%;
        }

        .content-bottom {
          display: flex;
          flex-direction: column;
          padding: 48px;
          padding-top: 16px;
        }

        /* Scrollbar glass component */
        .scrollbar-glass {
          background: radial-gradient(47.2% 50% at 50.39% 88.37%, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0) 100%),
            rgba(255, 255, 255, 0.04);
          position: relative;
          transition: background 0.3s ease;
          border-radius: 14px;
          width: fit-content;
          height: fit-content;
          padding: 8px 16px;
          text-transform: uppercase;
          font-weight: bold;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.9);
        }

        .scrollbar-glass:hover {
          background: radial-gradient(47.2% 50% at 50.39% 88.37%, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0) 100%),
            rgba(255, 255, 255, 0.08);
          cursor: pointer;
        }

        .scrollbar-glass::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          padding: 1px;
          background: linear-gradient(
            150deg,
            rgba(255, 255, 255, 0.48) 16.73%,
            rgba(255, 255, 255, 0.08) 30.2%,
            rgba(255, 255, 255, 0.08) 68.2%,
            rgba(255, 255, 255, 0.6) 81.89%
          );
          border-radius: inherit;
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: xor;
          -webkit-mask-composite: xor;
          pointer-events: none;
        }

        /* Typography */
        .title {
          font-size: 36px;
          font-weight: 500;
          margin-top: auto;
          color: white;
          margin-bottom: 0;
        }

        .description {
          opacity: 0.7;
          font-size: 14px;
          line-height: 1.5;
        }

        /* Divider */
        .divider {
          margin-top: auto;
          border: none;
          height: 1px;
          background-color: currentColor;
          opacity: 0.1;
          width: 100%;
          mask-image: linear-gradient(to right, transparent, black, transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, black, transparent);
        }
      `}</style>

      {/* SVG Definitions */}
      <svg className="svg-container">
        <defs>
          <filter id="turbulent-displace" colorInterpolationFilters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise1" seed="1" />
            <feOffset in="noise1" dx="0" dy="0" result="offsetNoise1">
              <animate attributeName="dy" values="700; 0" dur="6s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise2" seed="1" />
            <feOffset in="noise2" dx="0" dy="0" result="offsetNoise2">
              <animate attributeName="dy" values="0; -700" dur="6s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise1" seed="2" />
            <feOffset in="noise1" dx="0" dy="0" result="offsetNoise3">
              <animate attributeName="dx" values="490; 0" dur="6s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="10" result="noise2" seed="2" />
            <feOffset in="noise2" dx="0" dy="0" result="offsetNoise4">
              <animate attributeName="dx" values="0; -490" dur="6s" repeatCount="indefinite" calcMode="linear" />
            </feOffset>

            <feComposite in="offsetNoise1" in2="offsetNoise2" result="part1" />
            <feComposite in="offsetNoise3" in2="offsetNoise4" result="part2" />
            <feBlend in="part1" in2="part2" mode="color-dodge" result="combinedNoise" />

            <feDisplacementMap
              in="SourceGraphic"
              in2="combinedNoise"
              scale="30"
              xChannelSelector="R"
              yChannelSelector="B"
            />
          </filter>
        </defs>
      </svg>

      {/* Main Card Structure */}
      <div className="card-container">
        <div className="inner-container">
          <div className="border-outer">
            <div className="main-card"></div>
          </div>
          <div className="glow-layer-1"></div>
          <div className="glow-layer-2"></div>
        </div>

        <div className="overlay-1"></div>
        <div className="overlay-2"></div>
        <div className="background-glow"></div>

        <div className="content-container">
          <div className="content-top">
            <div className="scrollbar-glass">Metallic</div>
            <p className="title">Silver Border</p>
          </div>

          <hr className="divider" />

          <div className="content-bottom">
            <p className="description">In case you&apos;d like to emphasize something with metallic elegance.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
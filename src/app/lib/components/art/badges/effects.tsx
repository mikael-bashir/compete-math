import React, { ReactNode } from 'react';

interface DazzleBadgeEffectProps {
  children: ReactNode;  // Accepts any valid React child (elements, strings, etc.)
  size?: string;        // Optional because you have a default value
  color?: string;       // Optional because you have a default value
}

export const DazzleBadgeEffect = ({ 
  children, 
  size = '200px', 
  color = '#FFD700' 
}: DazzleBadgeEffectProps) => {
  return (
    <div className="dazzle-wrapper">
      {/* 1. The Rotating Rays */}
      <div className="god-rays" />
      
      {/* 2. The Badge (Your Image) */}
      <div className="badge-content">
        {children}
      </div>

      {/* 3. Scoped Styles for this component */}
      <style jsx>{`
        .dazzle-wrapper {
          position: relative;
          width: ${size};
          height: ${size};
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .badge-content {
          position: relative;
          z-index: 2;
          width: 60%; /* Adjusts how much space the badge takes inside the rays */
          height: 60%;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .god-rays {
          position: absolute;
          inset: 0;
          z-index: 1;
          border-radius: 50%;
          opacity: 0.8;
          
          /* The Magic Gradient */
          background: repeating-conic-gradient(
            from 0deg,
            transparent 0deg,
            transparent 10deg,
            ${color}20 15deg,  /* Faint start */
            ${color}80 20deg,  /* Bright center */
            ${color}20 25deg,  /* Faint end */
            transparent 35deg
          );

          /* The Mask: Fades center and edges for subtlety */
          mask-image: radial-gradient(
            rgba(0,0,0,1) 20%, 
            transparent 70%
          );
          -webkit-mask-image: radial-gradient(
            rgba(0,0,0,1) 20%, 
            transparent 70%
          );

          /* The Spin Animation */
          animation: spin-rays 12s linear infinite;
        }

        @keyframes spin-rays {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

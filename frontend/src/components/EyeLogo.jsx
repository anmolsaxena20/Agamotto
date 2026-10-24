import React from 'react';

export function EyeLogo({ size = 40, animated = true }) {
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          filter: 'drop-shadow(0 0 10px rgba(224, 176, 80, 0.4))',
        }}
      >
        {/* Outer mystical ring */}
        <circle
          cx="32"
          cy="32"
          r="28"
          stroke="#E0B050"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          opacity="0.75"
        />
        
        {/* Inner rotating geometric ring */}
        <circle
          cx="32"
          cy="32"
          r="22"
          stroke="#F2C766"
          strokeWidth="1"
          opacity="0.4"
        />

        {/* Eye almond shape outer curve */}
        <path
          d="M8 32C15 19 25 14 32 14C39 14 49 19 56 32C49 45 39 50 32 50C25 50 15 45 8 32Z"
          stroke="#E0B050"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Iris container */}
        <circle
          cx="32"
          cy="32"
          r="9"
          fill="#151A23"
          stroke="#E0B050"
          strokeWidth="2"
        />

        {/* Inner talisman rune cross */}
        <path
          d="M32 25V39M25 32H39"
          stroke="#F2C766"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Center pupil / core mystic glow */}
        <circle
          cx="32"
          cy="32"
          r="3"
          fill="#E0B050"
        />
      </svg>
    </div>
  );
}

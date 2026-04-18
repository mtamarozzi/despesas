import React from 'react';

const Orbs = () => {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {/* Orb 1 — ciano/teal, topo esquerdo */}
      <div
        style={{
          position: 'absolute',
          borderRadius: '50%',
          opacity: 0.6,
          top: '-160px',
          left: '-160px',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(34,211,238,0.6) 0%, rgba(34,211,238,0) 70%)',
          filter: 'blur(80px)',
        }}
      />
      {/* Orb 2 — âmbar, centro direito */}
      <div
        style={{
          position: 'absolute',
          borderRadius: '50%',
          opacity: 0.55,
          top: '33%',
          right: '-160px',
          width: '700px',
          height: '700px',
          background: 'radial-gradient(circle, rgba(251,146,60,0.55) 0%, rgba(251,146,60,0) 70%)',
          filter: 'blur(100px)',
        }}
      />
      {/* Orb 3 — rosa/magenta, inferior central */}
      <div
        style={{
          position: 'absolute',
          borderRadius: '50%',
          opacity: 0.55,
          bottom: '-160px',
          left: '33%',
          width: '650px',
          height: '650px',
          background: 'radial-gradient(circle, rgba(236,72,153,0.5) 0%, rgba(236,72,153,0) 70%)',
          filter: 'blur(90px)',
        }}
      />
      {/* Orb 4 — violeta (cor principal), diagonal sutil */}
      <div
        style={{
          position: 'absolute',
          borderRadius: '50%',
          opacity: 0.45,
          top: '50%',
          left: '25%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(157, 89, 255, 0.4) 0%, rgba(157, 89, 255, 0) 70%)',
          filter: 'blur(70px)',
        }}
      />
    </div>
  );
};

export default Orbs;

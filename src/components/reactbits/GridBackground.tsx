import { ReactNode } from 'react';
import { motion } from 'motion/react';

interface GridBackgroundProps {
  children?: ReactNode;
  className?: string;
}

export function GridBackground({ children, className = '' }: GridBackgroundProps) {
  return (
    <div className={`relative w-full h-full min-h-screen bg-slate-50 overflow-hidden ${className}`}>
      {/* Soft gradient blobs for color depth */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-100/40 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-100/40 blur-[150px] pointer-events-none" />
      <div className="absolute top-[30%] right-[10%] w-[30%] h-[30%] rounded-full bg-violet-100/30 blur-[100px] pointer-events-none" />

      {/* Grid Pattern with radial mask for center focus */}
      <div 
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(200, 210, 220, 0.4) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(200, 210, 220, 0.4) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          maskImage: 'radial-gradient(circle at center, black 30%, transparent 90%)',
          WebkitMaskImage: 'radial-gradient(circle at center, black 30%, transparent 90%)',
        }}
      />
      
      {/* Content wrapper */}
      <div className="relative z-10 w-full h-full">
        {children}
      </div>
    </div>
  );
}

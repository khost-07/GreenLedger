import { ReactNode } from 'react';
import { motion, HTMLMotionProps } from 'motion/react';
import { ArrowRight } from 'lucide-react';

interface GlassButtonProps extends HTMLMotionProps<"button"> {
  children: ReactNode;
  variant?: 'dark' | 'light';
  showArrow?: boolean;
  className?: string;
}

export function GlassButton({
  children,
  variant = 'dark',
  showArrow = false,
  className = '',
  ...props
}: GlassButtonProps) {
  const baseClasses = "relative overflow-hidden flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-bold transition-all duration-300";
  
  const variants = {
    dark: "bg-slate-800 text-white shadow-lg shadow-slate-800/20 hover:bg-slate-900 border border-slate-700/50 hover:shadow-xl hover:shadow-slate-800/30",
    light: "bg-white/70 text-slate-800 backdrop-blur-md shadow-lg shadow-slate-200/50 border border-white hover:bg-white hover:shadow-xl hover:shadow-slate-200/50"
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      className={`${baseClasses} ${variants[variant]} group ${className}`}
      {...props}
    >
      {/* Shine effect overlay */}
      <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12" />
      
      <span className="relative z-10 flex items-center gap-2">
        {children}
        {showArrow && (
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        )}
      </span>
    </motion.button>
  );
}

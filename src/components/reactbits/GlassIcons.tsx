import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { DivideIcon as LucideIcon } from 'lucide-react';

interface GlassIconsItem {
  icon: React.ElementType;
  title: string;
  desc: string;
}

export const GlassIcons = ({ items }: { items: GlassIconsItem[] }) => {
  return (
    <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6">
      {items.map((item, i) => (
        <motion.div
          key={i}
          whileHover={{ y: -5 }}
          className="bg-white rounded-[2rem] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] border border-slate-100 flex flex-col relative overflow-hidden group"
        >
          {/* Glass Icon Container */}
          <div className="w-12 h-12 rounded-2xl bg-[#F8F9FA] border border-slate-200/60 shadow-[inset_0_2px_4px_rgba(255,255,255,1),0_4px_10px_rgba(0,0,0,0.04)] flex items-center justify-center mb-6 z-10">
            <item.icon className="w-5 h-5 text-slate-700" strokeWidth={2} />
          </div>

          <div className="text-center w-full z-10 flex flex-col items-center">
            <h4 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h4>
            <p className="text-[#a5acb8] text-sm leading-relaxed max-w-[200px]">{item.desc}</p>
          </div>
          
          {/* Subtle Background Glow on Hover */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0" />
        </motion.div>
      ))}
    </div>
  );
};

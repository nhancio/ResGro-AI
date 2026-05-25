import React from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

export function WhyMatters() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const x1 = useTransform(scrollYProgress, [0, 1], [0, -200]);
  const x2 = useTransform(scrollYProgress, [0, 1], [-200, 0]);
  const x3 = useTransform(scrollYProgress, [0, 1], [0, -200]);

  return (
    <section ref={containerRef} className="py-14 sm:py-20 md:py-24 bg-white overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#FF6B35]/5 to-transparent" />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-10 sm:mb-16 relative z-10">
        <div className="text-center mb-8 sm:mb-14">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-black mb-3 sm:mb-4">Why Data <span className="text-[#FF6B35]">Matters</span></h2>
          <p className="text-gray-600 text-base sm:text-lg max-w-2xl mx-auto">The numbers that prove data-led decisions drive real results.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
            <div className="p-5 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl bg-orange-50 border border-orange-200 hover:shadow-lg transition-shadow text-center">
                <h3 className="text-3xl sm:text-4xl font-bold text-black mb-2 sm:mb-3">1 in 3</h3>
                <p className="text-gray-600 text-sm sm:text-base leading-relaxed">Australians use meal delivery platforms regularly</p>
            </div>
            <div className="p-5 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl bg-emerald-50 border border-emerald-200 hover:shadow-lg transition-shadow text-center">
                <h3 className="text-3xl sm:text-4xl font-bold text-black mb-2 sm:mb-3">65%</h3>
                <p className="text-gray-600 text-sm sm:text-base leading-relaxed">Of restaurants rely heavily on generic promotions</p>
            </div>
            <div className="p-5 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl bg-sky-50 border border-sky-200 hover:shadow-lg transition-shadow text-center">
                <h3 className="text-3xl sm:text-4xl font-bold text-black mb-2 sm:mb-3">+20%</h3>
                <p className="text-gray-600 text-sm sm:text-base leading-relaxed">Revenue uplift achievable with data-led decisions</p>
            </div>
            <div className="p-5 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl bg-amber-50 border border-amber-200 hover:shadow-lg transition-shadow text-center">
                <h3 className="text-3xl sm:text-4xl font-bold text-black mb-2 sm:mb-3">Data-led</h3>
                <p className="text-gray-600 text-sm sm:text-base leading-relaxed">Smart campaigns beat generic discounts every time</p>
            </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 sm:gap-2 md:gap-4 opacity-90 select-none mt-6 sm:mt-8 overflow-hidden max-w-[100vw]">
        <motion.div style={{ x: x1 }} className="whitespace-nowrap scroll-stroke-black py-1">
            <span className="text-3xl sm:text-5xl md:text-7xl lg:text-8xl xl:text-9xl font-black">CLICK CLICK CLICK CLICK CLICK CLICK</span>
        </motion.div>
        <motion.div style={{ x: x2 }} className="whitespace-nowrap scroll-stroke-orange py-1">
            <span className="text-3xl sm:text-5xl md:text-7xl lg:text-8xl xl:text-9xl font-black">OFFER OFFER OFFER OFFER OFFER OFFER</span>
        </motion.div>
        <motion.div style={{ x: x3 }} className="whitespace-nowrap scroll-stroke-black py-1">
            <span className="text-3xl sm:text-5xl md:text-7xl lg:text-8xl xl:text-9xl font-black">GROW GROW GROW GROW GROW GROW</span>
        </motion.div>
      </div>
      
      <style>{`
        .scroll-stroke-black span {
          color: transparent;
          -webkit-text-stroke: 2px #000;
          paint-order: stroke fill;
        }
        @media (max-width: 640px) {
          .scroll-stroke-black span { -webkit-text-stroke-width: 1.5px; }
        }
        .scroll-stroke-orange span {
          color: transparent;
          -webkit-text-stroke: 2px #FF6B35;
          paint-order: stroke fill;
        }
        @media (max-width: 640px) {
          .scroll-stroke-orange span { -webkit-text-stroke-width: 1.5px; }
        }
        @media (max-width: 380px) {
          .scroll-stroke-black span, .scroll-stroke-orange span { -webkit-text-stroke-width: 1px; }
        }
      `}</style>
    </section>
  );
}

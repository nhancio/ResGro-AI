import React from "react";
import { CheckCircle2, XCircle, ArrowRight } from "lucide-react";

export function IntelligenceEngine() {
  return (
    <section id="intelligence" className="py-14 sm:py-20 md:py-24 bg-white border-t border-gray-100 scroll-mt-24 sm:scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col lg:flex-row items-stretch lg:items-center gap-10 sm:gap-14 lg:gap-20">
        
        <div className="lg:w-1/2 min-w-0">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-black mb-6 sm:mb-8">Marketing <span className="text-[#FF6B35]">Intelligence</span> Engine</h2>
            <div className="space-y-4 sm:space-y-6">
                <div className="flex gap-3 sm:gap-5 p-4 sm:p-5 md:p-6 bg-orange-50 rounded-xl sm:rounded-2xl border border-orange-200 hover:shadow-lg transition-all">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0 bg-[#FF6B35] rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-base sm:text-lg">01</span>
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-lg sm:text-xl font-bold text-black mb-1 sm:mb-2">Geo-Demand <span className="text-[#FF6B35]">Analysis</span></h3>
                        <p className="text-black/80 text-sm sm:text-base leading-relaxed">Identify exactly where your orders are coming from and target under-served neighborhoods with precision ads.</p>
                    </div>
                </div>
                <div className="flex gap-3 sm:gap-5 p-4 sm:p-5 md:p-6 bg-emerald-50 rounded-xl sm:rounded-2xl border border-emerald-200 hover:shadow-lg transition-all">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0 bg-emerald-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-base sm:text-lg">02</span>
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-lg sm:text-xl font-bold text-black mb-1 sm:mb-2"><span className="text-[#FF6B35]">Competitor</span> Mapping</h3>
                        <p className="text-black/80 text-sm sm:text-base leading-relaxed">See what your competitors are offering and when. Adjust your pricing and bundles to win the buy box.</p>
                    </div>
                </div>
                <div className="flex gap-3 sm:gap-5 p-4 sm:p-5 md:p-6 bg-sky-50 rounded-xl sm:rounded-2xl border border-sky-200 hover:shadow-lg transition-all">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0 bg-sky-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-base sm:text-lg">03</span>
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-lg sm:text-xl font-bold text-black mb-1 sm:mb-2">Smart <span className="text-[#FF6B35]">Seasonal</span> Bundles</h3>
                        <p className="text-black/80 text-sm sm:text-base leading-relaxed">AI recommendations for menu bundles based on upcoming events, weather, and festive trends.</p>
                    </div>
                </div>
            </div>
        </div>

        <div className="lg:w-1/2 relative min-w-0">
             <div className="absolute -inset-2 sm:-inset-4 bg-gradient-to-r from-orange-500 to-violet-600 rounded-xl sm:rounded-2xl blur-2xl opacity-10" />
             <div className="relative rounded-xl sm:rounded-2xl overflow-hidden border border-gray-200 shadow-lg sm:shadow-xl">
                <img 
                    src="https://images.unsplash.com/photo-1759701059272-d83175fff799?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxmdXR1cmlzdGljJTIwY2l0eSUyMG5pZ2h0JTIwYWJzdHJhY3QlMjBibHVlJTIwbmVvbnxlbnwxfHx8fDE3NjczNDg0OTZ8MA&ixlib=rb-4.1.0&q=80&w=1080" 
                    alt="Intelligence Map" 
                    className="w-full h-auto object-cover"
                />
                <div className="absolute inset-0 bg-black/40" />
                
                <div className="absolute top-[15%] left-[10%] sm:top-1/4 sm:left-1/4 p-3 sm:p-4 bg-black/80 backdrop-blur-md border border-white/10 rounded-lg sm:rounded-xl flex items-center gap-2 sm:gap-3">
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                    <div className="min-w-0">
                        <div className="text-white text-xs sm:text-sm font-bold">High Demand Zone</div>
                        <div className="text-gray-400 text-[10px] sm:text-xs">+24% Order Vol</div>
                    </div>
                </div>

                <div className="absolute bottom-[15%] right-[10%] sm:bottom-1/4 sm:right-1/4 p-3 sm:p-4 bg-black/80 backdrop-blur-md border border-white/10 rounded-lg sm:rounded-xl flex items-center gap-2 sm:gap-3">
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500 flex-shrink-0" />
                    <div className="min-w-0">
                        <div className="text-white text-xs sm:text-sm font-bold">Competitor Spiked</div>
                        <div className="text-gray-400 text-[10px] sm:text-xs">Offering 20% Off</div>
                    </div>
                </div>
             </div>
        </div>

      </div>
    </section>
  );
}

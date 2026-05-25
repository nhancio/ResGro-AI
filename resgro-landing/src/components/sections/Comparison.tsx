import React from "react";
import { motion } from "motion/react";
import { CheckCircle2, XCircle, Cpu, DollarSign, Lightbulb, Clock } from "lucide-react";

const comparisonData = [
  {
    label: "Methodology",
    icon: Cpu,
    agency: "Manual data analysis and high TATs",
    resgro: "AI powered analysis engine",
  },
  {
    label: "Cost & Efficiency",
    icon: DollarSign,
    agency: "High cost of human employees",
    resgro: "AI agents with 24/7 uptime and very low cost",
  },
  {
    label: "Strategies",
    icon: Lightbulb,
    agency: "Basic strategies",
    resgro: "Data backed strategies",
  },
  {
    label: "Setup Time",
    icon: Clock,
    agency: "1–2 months",
    resgro: "1 week",
  },
];

export function Comparison() {
  return (
    <section className="py-14 sm:py-20 md:py-24 bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-8 sm:mb-14"
        >
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-black mb-3 sm:mb-4">
            Why <span className="text-[#FF6B35]">RESGRO</span> Wins
          </h2>
          <p className="text-gray-600 text-base sm:text-lg max-w-2xl mx-auto">
            See how we compare to traditional agencies across every metric that matters.
          </p>
        </motion.div>

        {/* Mobile: stacked cards. Tablet/Desktop: table */}
        <div className="space-y-4 md:space-y-0">
          {/* Desktop table header */}
          <div className="hidden md:grid grid-cols-3 border-b border-gray-200 bg-gray-50 rounded-t-2xl overflow-hidden">
            <div className="px-4 py-4 lg:px-6 lg:py-5">
              <span className="text-xs lg:text-sm font-bold text-gray-500 uppercase tracking-wider">Feature</span>
            </div>
            <div className="px-4 py-4 lg:px-6 lg:py-5 text-center border-l border-gray-200">
              <span className="text-xs lg:text-sm font-bold text-gray-500 uppercase tracking-wider">Traditional Agencies</span>
            </div>
            <div className="px-4 py-4 lg:px-6 lg:py-5 text-center border-l border-gray-200 bg-orange-50">
              <span className="text-xs lg:text-sm font-bold text-[#FF6B35] uppercase tracking-wider">ResGro</span>
            </div>
          </div>

          <div className="bg-white md:rounded-b-2xl md:rounded-t-none rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
            {comparisonData.map((row, index) => {
              const Icon = row.icon;
              const isLast = index === comparisonData.length - 1;

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.08 }}
                  viewport={{ once: true }}
                  className={`${!isLast ? "border-b border-gray-100" : ""} hover:bg-gray-50/50 transition-colors`}
                >
                  {/* Mobile: single card per row */}
                  <div className="md:hidden p-4 sm:p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#FF6B35] flex items-center justify-center text-white flex-shrink-0">
                        <Icon size={20} />
                      </div>
                      <span className="text-base font-bold text-black">{row.label}</span>
                    </div>
                    <div className="flex items-start gap-3 pl-1">
                      <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-semibold text-gray-500 uppercase block mb-0.5">Traditional</span>
                        <span className="text-sm text-gray-600">{row.agency}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 pl-1 p-3 rounded-xl bg-orange-50/80 border border-orange-100">
                      <CheckCircle2 className="w-5 h-5 text-[#FF6B35] flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-semibold text-[#FF6B35] uppercase block mb-0.5">ResGro</span>
                        <span className="text-sm font-semibold text-black">{row.resgro}</span>
                      </div>
                    </div>
                  </div>

                  {/* Desktop: table row */}
                  <div className="hidden md:grid grid-cols-3">
                    <div className="px-4 py-4 lg:px-6 lg:py-6 flex items-center gap-3">
                      <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-[#FF6B35] flex items-center justify-center text-white flex-shrink-0">
                        <Icon size={20} />
                      </div>
                      <span className="text-sm lg:text-base font-bold text-black">{row.label}</span>
                    </div>
                    <div className="px-4 py-4 lg:px-6 lg:py-6 flex items-center justify-center gap-2 border-l border-gray-100">
                      <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                      <span className="text-sm lg:text-base text-gray-600">{row.agency}</span>
                    </div>
                    <div className="px-4 py-4 lg:px-6 lg:py-6 flex items-center justify-center gap-2 border-l border-gray-100 bg-orange-50/50">
                      <CheckCircle2 className="w-5 h-5 text-[#FF6B35] flex-shrink-0" />
                      <span className="text-sm lg:text-base font-semibold text-black">{row.resgro}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

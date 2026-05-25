import React from "react";
import { motion } from "motion/react";
import { BarChart3, FileCheck, TrendingUp } from "lucide-react";

export function CaseStudy() {
  return (
    <section id="case-study" className="py-14 sm:py-20 md:py-24 bg-gray-50 scroll-mt-24 sm:scroll-mt-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-8 sm:mb-14"
        >
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-black mb-3 sm:mb-4">
            Case <span className="text-[#FF6B35]">Study</span>
          </h2>
          <p className="text-gray-600 text-base sm:text-lg max-w-2xl mx-auto">
            How we helped an Australian restaurant achieve measurable growth with data science and AI.
          </p>
        </motion.div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          viewport={{ once: true }}
          className="bg-white rounded-xl sm:rounded-2xl border border-gray-200 shadow-lg overflow-hidden"
        >
          <div className="p-5 sm:p-8 md:p-12">
            {/* Tags */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-6 sm:mb-10">
              <span className="px-3 py-1.5 sm:px-5 sm:py-2 rounded-full bg-orange-50 border border-orange-200 text-[#FF6B35] font-semibold text-xs sm:text-sm">
                Reports
              </span>
              <span className="px-3 py-1.5 sm:px-5 sm:py-2 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold text-xs sm:text-sm">
                Recommendations
              </span>
              <span className="px-3 py-1.5 sm:px-5 sm:py-2 rounded-full bg-sky-50 border border-sky-200 text-sky-700 font-semibold text-xs sm:text-sm">
                Customer Success
              </span>
            </div>

            {/* 3 Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-10">
              <div className="bg-orange-50 border border-orange-200 rounded-xl sm:rounded-2xl p-5 sm:p-6 md:p-8 text-center hover:shadow-md transition-shadow">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl bg-[#FF6B35] flex items-center justify-center mx-auto mb-3 sm:mb-5">
                  <BarChart3 className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-black mb-1 sm:mb-2">Unified Reports</h3>
                <p className="text-gray-600 text-xs sm:text-sm leading-relaxed">
                  UberEats & DoorDash performance in one dashboard with weekly insights.
                </p>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl sm:rounded-2xl p-5 sm:p-6 md:p-8 text-center hover:shadow-md transition-shadow">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl bg-emerald-600 flex items-center justify-center mx-auto mb-3 sm:mb-5">
                  <FileCheck className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-black mb-1 sm:mb-2">Recommendations</h3>
                <p className="text-gray-600 text-xs sm:text-sm leading-relaxed">
                  AI-driven menu and campaign suggestions based on competitor and demand data.
                </p>
              </div>

              <div className="bg-sky-50 border border-sky-200 rounded-xl sm:rounded-2xl p-5 sm:p-6 md:p-8 text-center hover:shadow-md transition-shadow">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl bg-sky-600 flex items-center justify-center mx-auto mb-3 sm:mb-5">
                  <TrendingUp className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-black mb-1 sm:mb-2">Revenue Uplift</h3>
                <p className="text-gray-600 text-xs sm:text-sm leading-relaxed">
                  Customer achieved <strong>20% revenue uplift</strong> within 6 months.
                </p>
              </div>
            </div>

            {/* Success Story */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl sm:rounded-2xl p-5 sm:p-6 md:p-8 text-center">
              <h4 className="font-bold text-black mb-2 sm:mb-3 text-base sm:text-lg">Customer Success</h4>
              <p className="text-gray-600 text-sm sm:text-base leading-relaxed max-w-3xl mx-auto">
                A multi-location restaurant in Australia partnered with ResGro to consolidate delivery analytics and run targeted campaigns. 
                Using our reports and recommendations, they optimised menu placement and promotions, resulting in a <strong className="text-black">20% revenue uplift</strong> on delivery channels. 
                Data-led decisions replaced guesswork and generic discounts.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

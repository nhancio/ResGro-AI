import React from "react";
import { motion, useInView } from "motion/react";
import { TrendingDown, Users, DollarSign, ShoppingBag } from "lucide-react";
import { useRef } from "react";

const BOX_COLORS = [
    { bg: "bg-orange-50", border: "border-orange-200", iconBg: "bg-[#FF6B35]", text: "text-black" },
    { bg: "bg-emerald-50", border: "border-emerald-200", iconBg: "bg-emerald-600", text: "text-black" },
    { bg: "bg-sky-50", border: "border-sky-200", iconBg: "bg-sky-600", text: "text-black" },
    { bg: "bg-amber-50", border: "border-amber-200", iconBg: "bg-amber-500", text: "text-black" },
];

const StatsCard = ({ icon: Icon, label, value, subtext, delay, color }: { icon: any, label: string, value: string, subtext: string, delay: number, color: typeof BOX_COLORS[0] }) => {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: "-100px" });

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6, delay }}
            className={`p-5 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl ${color.bg} border ${color.border} transition-all group hover:shadow-lg text-center`}
        >
            <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl ${color.iconBg} flex items-center justify-center text-white mx-auto mb-3 sm:mb-4`}>
                <Icon size={22} className="sm:w-[26px] sm:h-[26px]" />
            </div>
            <h3 className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 sm:mb-3">{label}</h3>
            <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-black mb-2 sm:mb-3">{value}</div>
            <p className="text-gray-600 text-xs sm:text-sm">{subtext}</p>
        </motion.div>
    );
};

export function MarketPain() {
  return (
    <section className="py-14 sm:py-20 md:py-24 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="mb-10 sm:mb-14 md:mb-16 text-center max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-black mb-4 sm:mb-6">The Hidden Cost of Inefficiency</h2>
            <p className="text-black/80 text-base sm:text-lg leading-relaxed px-1">
                Restaurants are losing margins due to inefficient tools, fragmented data, and promotion heavy competition.
                The market is growing, but are you capturing your share?
            </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
            <StatsCard 
                icon={DollarSign}
                label="Market Size (2025)"
                value="~$1.8B"
                subtext="Total AUD food delivery market"
                delay={0}
                color={BOX_COLORS[0]}
            />
            <StatsCard 
                icon={ShoppingBag}
                label="Competition"
                value="~15,000"
                subtext="Restaurants selling online in AU"
                delay={0.1}
                color={BOX_COLORS[1]}
            />
            <StatsCard 
                icon={Users}
                label="Active Users"
                value="12M"
                subtext="Australians used delivery apps in 2024"
                delay={0.2}
                color={BOX_COLORS[2]}
            />
            <StatsCard 
                icon={TrendingDown}
                label="Frequency"
                value="4.2x"
                subtext="Monthly orders per consumer"
                delay={0.3}
                color={BOX_COLORS[3]}
            />
        </div>
      </div>
    </section>
  );
}

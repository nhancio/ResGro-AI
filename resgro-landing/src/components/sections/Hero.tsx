import React from "react";
import { Button } from "../ui/button";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { openPortal } from "../../config/app";

interface HeroProps {
  isSubscribed?: boolean;
}

export function Hero({ isSubscribed = false }: HeroProps) {
  return (
    <section className="relative min-h-[100dvh] sm:min-h-screen flex items-center justify-center pt-20 sm:pt-24 pb-12 sm:pb-16 overflow-hidden bg-white">
      {/* Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(249,115,22,0.1),transparent_50%)]" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-orange-100 rounded-full blur-[80px] sm:blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-white border-2 border-[#FF6B35] mb-6 sm:mb-10 backdrop-blur-sm"
        >
          <span className="w-2 h-2 rounded-full bg-[#FF6B35] animate-pulse flex-shrink-0" />
          <span className="text-xs sm:text-sm font-medium text-[#FF6B35]">New: AI-Powered Competitor Analysis</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-bold tracking-tight text-black mb-5 sm:mb-8 leading-tight px-1"
        >
          Data Science Powered Growth <br />
          <span className="text-[#FF6B35]">
            for Modern Restaurants
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-base sm:text-lg md:text-xl text-black/90 max-w-3xl mx-auto mb-8 sm:mb-12 leading-relaxed px-1"
        >
          Helping Australian restaurants unlock delivery revenue from UberEats and DoorDash using deep analytics and personalised campaigns.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4"
        >
          {isSubscribed ? (
            <Button
              size="lg"
              onClick={() => {
                openPortal();
              }}
              variant="cta"
              className="w-full sm:w-auto min-h-[48px] h-12 sm:h-14 px-6 sm:px-8 text-base sm:text-lg rounded-full transition-all hover:scale-[1.02] active:scale-[0.98] touch-manipulation"
            >
              Go to Dashboard
              <ArrowRight className="ml-2 w-5 h-5 flex-shrink-0" />
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={() => {
                window.location.hash = "#/get-started";
              }}
              variant="cta"
              className="w-full sm:w-auto min-h-[48px] h-12 sm:h-14 px-6 sm:px-8 text-base sm:text-lg rounded-full transition-all hover:scale-[1.02] active:scale-[0.98] touch-manipulation"
            >
              Get Started
              <ArrowRight className="ml-2 w-5 h-5 flex-shrink-0" />
            </Button>
          )}
        </motion.div>
        
        {/* Floating UI Elements Mockup */}
        <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="mt-12 sm:mt-16 md:mt-24 relative mx-auto max-w-5xl px-0 sm:px-2"
        >
             <div className="relative rounded-t-lg sm:rounded-t-xl overflow-hidden border-2 border-[#FF6B35] shadow-xl sm:shadow-2xl bg-white backdrop-blur-xl">
                <div className="h-7 sm:h-8 bg-white border-b-2 border-[#FF6B35] flex items-center px-3 sm:px-4 gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500/50" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                    <div className="w-3 h-3 rounded-full bg-green-500/50" />
                </div>
                <div className="aspect-[16/9] relative">
                    <img 
                        src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkaWdpdGFsJTIwYW5hbHl0aWNzJTIwZGFzaGJvYXJkJTIwc2NyZWVuJTIwZnV0dXJpc3RpY3xlbnwxfHx8fDE3NjczNDg0OTZ8MA&ixlib=rb-4.1.0&q=80&w=1080" 
                        alt="Dashboard" 
                        className="w-full h-full object-cover opacity-80"
                    />
                    {/* Overlay Graphics */}
                    <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />
                </div>
             </div>
        </motion.div>
      </div>
    </section>
  );
}

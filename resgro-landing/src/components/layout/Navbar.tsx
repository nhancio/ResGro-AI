import React, { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Menu, X, Linkedin, Instagram, Twitter } from "lucide-react";
import { FacebookIcon } from "../icons/FacebookIcon";
import { motion, AnimatePresence } from "motion/react";
import { openPortal } from "../../config/app";

const NAV_ITEMS = [
  { label: "Solution", id: "solution" },
  { label: "Intelligence", id: "intelligence" },
  { label: "Process", id: "process" },
  { label: "Case Study", id: "case-study" },
];

const SOCIAL_LINKS = [
  { href: "https://www.linkedin.com/company/resgro-ai", label: "LinkedIn", icon: Linkedin },
  { href: "https://www.facebook.com/profile.php?id=61586497146713", label: "Facebook", icon: FacebookIcon },
  { href: "https://www.instagram.com/resgro.australia/", label: "Instagram", icon: Instagram },
  { href: "https://x.com/Resgro_AI", label: "X", icon: Twitter },
];

interface NavbarProps {
  isSubscribed?: boolean;
}

export function Navbar({ isSubscribed = false }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Lock body scroll when mobile menu is open (responsive)
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    } else {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    let observer: IntersectionObserver | null = null;
    const timer = setTimeout(() => {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) setActiveSection(entry.target.id);
          });
        },
        { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
      );
      NAV_ITEMS.forEach(({ id }) => {
        const el = document.getElementById(id);
        if (el) observer?.observe(el);
      });
    }, 100);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
    };
  }, []);

  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        mobileMenuOpen
          ? "bg-white border-b-2 border-[#FF6B35]"
          : isScrolled
            ? "bg-white/80 backdrop-blur-md border-b-2 border-[#FF6B35]"
            : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 md:h-20 flex items-center justify-between gap-2 pt-[env(safe-area-inset-top)]">
        <button 
          onClick={scrollToTop}
          className="flex flex-col items-start gap-0.5 cursor-pointer hover:opacity-80 transition-opacity min-w-0"
        >
          <div className="flex items-center gap-1.5 sm:gap-2">
            <img 
              src="/logo.png" 
              alt="RESGRO Logo" 
              className="h-6 sm:h-8 w-auto"
            />
            <span className="text-xl sm:text-2xl font-bold tracking-tight text-black">
              RES<span className="text-[#FF6B35]">GRO</span>
            </span>
          </div>
          <span className="text-[10px] sm:text-xs font-medium text-black/80 hidden sm:block max-w-[180px] md:max-w-[220px] truncate">
            Your Restaurant + AI Strategy = Growth
          </span>
        </button>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-2 sm:gap-4 lg:gap-6 xl:gap-8 flex-wrap justify-end">
          {NAV_ITEMS.map(({ label, id }) => (
            <button
              key={id}
              type="button"
              onClick={() => scrollToSection(id)}
              className={`text-sm font-medium transition-all whitespace-nowrap px-3 py-2 rounded-full ${
                activeSection === id
                  ? "bg-[#FF6B35] text-white hover:bg-[#FF8C42]"
                  : "text-black hover:text-[#FF6B35] hover:bg-orange-50"
              }`}
            >
              {label}
            </button>
          ))}
          <div className="flex items-center gap-1.5 border-l border-gray-200 pl-4 lg:pl-6">
            {SOCIAL_LINKS.map(({ href, label, icon: Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-[#FF6B35] hover:text-white transition-colors flex-shrink-0"
                aria-label={label}
              >
                <Icon size={18} />
              </a>
            ))}
          </div>
          {isSubscribed ? (
            <Button
              type="button"
              variant="cta"
              onClick={() => { openPortal(); }}
              className="rounded-full px-5 py-2.5 min-h-[44px] text-sm lg:text-base flex-shrink-0"
            >
              Dashboard
            </Button>
          ) : (
            <Button
              type="button"
              variant="cta"
              onClick={() => { window.location.hash = "#/get-started"; }}
              className="rounded-full px-5 py-2.5 min-h-[44px] text-sm lg:text-base flex-shrink-0"
            >
              Get Started
            </Button>
          )}
        </div>

        {/* Mobile Toggle - min 44px tap target */}
        <button
          className="md:hidden text-black w-11 h-11 flex items-center justify-center -mr-1 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-b-2 border-[#FF6B35] overflow-hidden"
          >
            <div className="flex flex-col p-4 sm:p-6 gap-0">
              {NAV_ITEMS.map(({ label, id }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => scrollToSection(id)}
                  className={`min-h-[48px] px-4 py-3 text-left text-base sm:text-lg font-medium rounded-xl active:bg-gray-100 touch-manipulation w-full ${
                    activeSection === id ? "text-white bg-[#FF6B35] hover:bg-[#FF8C42]" : "text-black hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
              <div className="flex gap-3 flex-wrap py-4 border-t border-gray-100 mt-2">
                {SOCIAL_LINKS.map(({ href, label, icon: Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-black hover:bg-[#FF6B35] hover:text-white transition-colors touch-manipulation"
                    aria-label={label}
                  >
                    <Icon size={20} />
                  </a>
                ))}
              </div>
              <div className="flex flex-col gap-3 mt-2">
                {isSubscribed ? (
                  <Button
                    type="button"
                    variant="cta"
                    onClick={() => { setMobileMenuOpen(false); openPortal(); }}
                    className="w-full min-h-[48px] rounded-full text-base touch-manipulation"
                  >
                    Dashboard
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="cta"
                    onClick={() => { setMobileMenuOpen(false); window.location.hash = "#/get-started"; }}
                    className="w-full min-h-[48px] rounded-full text-base touch-manipulation"
                  >
                    Get Started
                  </Button>
                )}
                <a
                  href="#/privacy-policy"
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.hash = "#/privacy-policy";
                    setMobileMenuOpen(false);
                  }}
                  className="min-h-[44px] px-4 py-3 text-center text-sm font-medium text-gray-600 hover:text-[#FF6B35] rounded-xl touch-manipulation"
                >
                  Privacy Policy
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

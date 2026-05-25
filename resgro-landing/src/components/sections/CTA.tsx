import React, { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Mail, Globe, MapPin, Linkedin, Twitter, Instagram, Send, Loader2 } from "lucide-react";
import { FacebookIcon } from "../icons/FacebookIcon";
import emailjs from "@emailjs/browser";

export function CTA() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    mobile: "",
    restaurant: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus("idle");

    try {
      const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
      const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
      const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;

      if (!publicKey || !serviceId || !templateId) {
        throw new Error("EmailJS configuration is missing.");
      }

      const templateParams = {
        from_name: formData.name,
        from_email: formData.email,
        mobile: formData.mobile || "Not provided",
        restaurant: formData.restaurant || "Not provided",
        message: formData.message,
        to_email: "contact@resgro.ai",
        reply_to: formData.email,
      };

      await emailjs.send(serviceId, templateId, templateParams, publicKey);

      setSubmitStatus("success");
      setFormData({ name: "", email: "", mobile: "", restaurant: "", message: "" });
      setTimeout(() => setSubmitStatus("idle"), 5000);
    } catch (error) {
      console.error("EmailJS Error:", error);
      setSubmitStatus("error");
      setTimeout(() => setSubmitStatus("idle"), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <footer className="bg-gray-50 pt-14 sm:pt-20 md:pt-24 pb-10 sm:pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        
        {/* Main CTA Banner */}
        <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden bg-[#FF6B35] p-6 sm:p-10 md:p-14 lg:p-20 text-center mb-12 sm:mb-16 md:mb-20">
          <div className="absolute inset-0 bg-gradient-to-br from-[#FF6B35] to-[#e85d2c]" />
          <div className="relative z-10">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white mb-4 sm:mb-6">Ready to Grow Your Restaurant?</h2>
            <p className="text-white/90 text-base sm:text-lg md:text-xl max-w-2xl mx-auto mb-6 sm:mb-8 md:mb-10">
              Join hundreds of Australian restaurants using data to outperform the market.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Button
                size="lg"
                onClick={() => { window.location.hash = "#/get-started"; }}
                variant="cta-inverse"
                className="w-full sm:w-auto min-h-[48px] h-12 sm:h-14 px-8 sm:px-10 text-base sm:text-lg rounded-full transition-all touch-manipulation"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        <div id="contact-form" className="mb-12 sm:mb-16 md:mb-20 max-w-2xl mx-auto scroll-mt-24 sm:scroll-mt-20">
          <div className="rounded-2xl sm:rounded-3xl bg-white border border-gray-200 p-5 sm:p-8 md:p-10 lg:p-14 shadow-lg">
            <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-black mb-3 sm:mb-4 text-center">Contact <span className="text-[#FF6B35]">Us</span></h3>
            <p className="text-black/70 text-sm sm:text-base text-center mb-6 sm:mb-10">
              Get in touch with us to learn more about how we can help grow your restaurant.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-black mb-2">Name *</label>
                  <Input
                    id="name" name="name" type="text" required
                    value={formData.name} onChange={handleChange}
                    className="w-full bg-white border border-gray-300 text-black placeholder:text-gray-400 focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35] rounded-xl min-h-[48px] h-12 text-base"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-black mb-2">Email *</label>
                  <Input
                    id="email" name="email" type="email" required
                    value={formData.email} onChange={handleChange}
                    className="w-full bg-white border border-gray-300 text-black placeholder:text-gray-400 focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35] rounded-xl min-h-[48px] h-12 text-base"
                    placeholder="your@email.com"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="mobile" className="block text-sm font-medium text-black mb-2">Mobile number</label>
                <Input
                  id="mobile" name="mobile" type="tel"
                  value={formData.mobile} onChange={handleChange}
                  className="w-full bg-white border border-gray-300 text-black placeholder:text-gray-400 focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35] rounded-xl min-h-[48px] h-12 text-base"
                  placeholder="e.g. +61 400 000 000"
                />
              </div>
              <div>
                <label htmlFor="restaurant" className="block text-sm font-medium text-black mb-2">Restaurant Name</label>
                <Input
                  id="restaurant" name="restaurant" type="text"
                  value={formData.restaurant} onChange={handleChange}
                  className="w-full bg-white border border-gray-300 text-black placeholder:text-gray-400 focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35] rounded-xl min-h-[48px] h-12 text-base"
                  placeholder="Your restaurant name"
                />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-black mb-2">Message *</label>
                <Textarea
                  id="message" name="message" required
                  value={formData.message} onChange={handleChange} rows={5}
                  className="w-full bg-white border border-gray-300 text-black placeholder:text-gray-400 focus:border-[#FF6B35] focus:ring-1 focus:ring-[#FF6B35] resize-none rounded-xl min-h-[120px] text-base py-3"
                  placeholder="Tell us about your restaurant and how we can help..."
                />
              </div>
              <Button
                type="submit" size="lg" disabled={isSubmitting}
                variant="cta"
                className="w-full min-h-[48px] h-12 sm:h-14 text-base sm:text-lg rounded-full disabled:cursor-not-allowed touch-manipulation"
              >
                {isSubmitting ? (
                  <><Loader2 className="mr-2 w-5 h-5 animate-spin" /> Sending...</>
                ) : (
                  <><Send className="mr-2 w-5 h-5" /> Submit</>
                )}
              </Button>
              {submitStatus === "success" && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-center font-medium">
                  Thank you for your message! We'll get back to you soon.
                </div>
              )}
              {submitStatus === "error" && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-center font-medium">
                  Something went wrong. Please try again or contact us directly at contact@resgro.ai
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Footer Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 sm:gap-10 md:gap-12 border-t border-gray-200 pt-10 sm:pt-14 md:pt-16 pb-8 sm:pb-12">
          <div className="md:col-span-2 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 mb-4 sm:mb-6">
              <img src="/logo.png" alt="RESGRO Logo" className="h-7 sm:h-8 w-auto" />
              <span className="text-xl sm:text-2xl font-bold tracking-tight text-black">
                RES<span className="text-[#FF6B35]">GRO</span>
              </span>
            </div>
            <p className="text-black/70 max-w-sm mx-auto md:mx-0 mb-6 sm:mb-8 text-sm sm:text-base leading-relaxed">
              Data science powered growth engine for modern restaurants in Australia & New Zealand.
            </p>
            <div className="flex justify-center md:justify-start gap-3">
              <a href="https://www.linkedin.com/company/resgro-ai" target="_blank" rel="noreferrer" className="w-11 h-11 rounded-full bg-[#FF6B35] flex items-center justify-center text-white hover:bg-[#FF8C42] transition-colors touch-manipulation" aria-label="LinkedIn"><Linkedin size={18} /></a>
              <a href="https://www.facebook.com/profile.php?id=61586497146713" target="_blank" rel="noreferrer" className="w-11 h-11 rounded-full bg-[#FF6B35] flex items-center justify-center text-white hover:bg-[#FF8C42] transition-colors touch-manipulation" aria-label="Facebook"><FacebookIcon size={18} /></a>
              <a href="https://www.instagram.com/resgro.australia/" target="_blank" rel="noreferrer" className="w-11 h-11 rounded-full bg-[#FF6B35] flex items-center justify-center text-white hover:bg-[#FF8C42] transition-colors touch-manipulation" aria-label="Instagram"><Instagram size={18} /></a>
              <a href="https://x.com/Resgro_AI" target="_blank" rel="noreferrer" className="w-11 h-11 rounded-full bg-[#FF6B35] flex items-center justify-center text-white hover:bg-[#FF8C42] transition-colors touch-manipulation" aria-label="X"><Twitter size={18} /></a>
            </div>
          </div>

          <div className="text-center md:text-left">
            <h4 className="text-black font-bold mb-4 sm:mb-6 text-base sm:text-lg">Contact</h4>
            <ul className="space-y-3 sm:space-y-4">
              <li className="flex items-center justify-center md:justify-start gap-3 text-black/80 hover:text-[#FF6B35] transition-colors">
                <Mail size={18} className="flex-shrink-0" />
                <a href="mailto:contact@resgro.ai" className="min-h-[44px] flex items-center justify-center md:justify-start">contact@resgro.ai</a>
              </li>
              <li className="flex items-center justify-center md:justify-start gap-3 text-black/80 hover:text-[#FF6B35] transition-colors">
                <Globe size={18} className="flex-shrink-0" />
                <a href="https://www.resgro.ai" target="_blank" rel="noreferrer" className="min-h-[44px] flex items-center justify-center md:justify-start">www.resgro.ai</a>
              </li>
              <li className="flex items-center justify-center md:justify-start gap-3 text-black/80">
                <MapPin size={18} className="flex-shrink-0" />
                <span>Australia</span>
              </li>
            </ul>
          </div>

          <div className="text-center md:text-left">
            <h4 className="text-black font-bold mb-4 sm:mb-6 text-base sm:text-lg">Links</h4>
            <ul className="space-y-3 sm:space-y-4">
              <li>
                <a
                  href="#/get-started"
                  className="text-black/80 hover:text-[#FF6B35] transition-colors inline-block py-2 min-h-[44px] flex flex-col items-center md:items-start justify-center touch-manipulation"
                >
                  Get Started
                </a>
              </li>
              <li>
                <a
                  href="#/pricing"
                  className="text-black/80 hover:text-[#FF6B35] transition-colors inline-block py-2 min-h-[44px] flex flex-col items-center md:items-start justify-center touch-manipulation"
                >
                  Pricing
                </a>
              </li>
              <li>
                <a href="#case-study" onClick={(e) => { e.preventDefault(); document.getElementById("case-study")?.scrollIntoView({ behavior: "smooth" }); }} className="text-black/80 hover:text-[#FF6B35] transition-colors inline-block py-2 min-h-[44px] flex items-center justify-center md:justify-start">
                  Case Study
                </a>
              </li>
              <li>
                <a href="#/privacy-policy" className="text-black/80 hover:text-[#FF6B35] transition-colors inline-block py-2 min-h-[44px] flex items-center justify-center md:justify-start">
                  Privacy Policy
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-6 sm:pt-8 text-center text-black/50 text-xs sm:text-sm border-t border-gray-200">
          &copy; {new Date().getFullYear()} RESGRO. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

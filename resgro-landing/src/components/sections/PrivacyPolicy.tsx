import React from "react";

export function PrivacyPolicy() {
  return (
    <section className="py-12 sm:py-16 md:py-24 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-center text-black mb-3 sm:mb-4">
          Privacy <span className="text-[#FF6B35]">Policy</span>
        </h1>
        <p className="text-center text-black/50 text-xs sm:text-sm mb-10 sm:mb-16">Last updated: February 2026</p>

        <div className="bg-gray-50 rounded-2xl sm:rounded-3xl border border-gray-200 p-5 sm:p-8 md:p-10 lg:p-14 shadow-sm">
          <div className="space-y-8 sm:space-y-10 text-black/80 text-sm sm:text-base leading-relaxed">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-black mb-2 sm:mb-3">1. Introduction</h3>
              <p>
                ResGro ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website www.resgro.ai and our services. Please read this policy carefully.
              </p>
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-bold text-black mb-2 sm:mb-3">2. Information We Collect</h3>
              <p className="mb-3">
                We may collect personal data and other information that you provide when using our services, including but not limited to:
              </p>
              <ul className="list-disc pl-5 sm:pl-6 space-y-1.5 sm:space-y-2">
                <li>Contact details (name, email address, phone number, business address)</li>
                <li>Restaurant or business name and related information</li>
                <li>Account credentials and preferences</li>
                <li>Communications and correspondence with us</li>
                <li>Usage data including IP address, browser type, device identifiers, and how you use our website and services</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-bold text-black mb-2 sm:mb-3">3. How We Use Your Information</h3>
              <p className="mb-3">ResGro uses the information we collect to:</p>
              <ul className="list-disc pl-5 sm:pl-6 space-y-1.5 sm:space-y-2">
                <li>Provide, operate, and improve our services</li>
                <li>Process and respond to your enquiries and contact form submissions</li>
                <li>Send you relevant updates, reports, and marketing communications (where you have agreed)</li>
                <li>Analyse usage and trends to improve our platform and user experience</li>
                <li>Comply with legal and regulatory obligations</li>
                <li>Protect the security and integrity of our systems and users</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-bold text-black mb-2 sm:mb-3">4. Data Sharing and Disclosure</h3>
              <p className="mb-3">We do not sell your personal data. We may share your information only with:</p>
              <ul className="list-disc pl-5 sm:pl-6 space-y-1.5 sm:space-y-2">
                <li>Service providers who assist us in operating our business (e.g. email delivery, hosting), subject to confidentiality</li>
                <li>Legal or regulatory authorities when required by law</li>
                <li>Other parties with your consent</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-bold text-black mb-2 sm:mb-3">5. Data Security and Retention</h3>
              <p>
                We implement appropriate technical and organisational measures to protect your personal data against unauthorised access, alteration, disclosure, or destruction. We retain your information only for as long as necessary to fulfil the purposes set out in this policy or as required by law.
              </p>
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-bold text-black mb-2 sm:mb-3">6. Your Rights</h3>
              <p>
                Depending on your location, you may have the right to access, correct, delete, or restrict the processing of your personal data, or to object to processing and to data portability. To exercise these rights or ask questions about your data, contact us at <a href="mailto:contact@resgro.ai" className="text-[#FF6B35] hover:underline font-medium">contact@resgro.ai</a>.
              </p>
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-bold text-black mb-2 sm:mb-3">7. Cookies and Similar Technologies</h3>
              <p>
                Our website may use cookies and similar technologies to improve functionality and analyse usage. You can manage cookie preferences through your browser settings.
              </p>
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-bold text-black mb-2 sm:mb-3">8. Changes to This Policy</h3>
              <p>
                We may update this Privacy Policy from time to time. We will post the updated policy on this page and, where appropriate, notify you by email or through our services.
              </p>
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-bold text-black mb-2 sm:mb-3">9. Contact Us</h3>
              <p>
                For any questions about this Privacy Policy or our data practices, please contact ResGro at <a href="mailto:contact@resgro.ai" className="text-[#FF6B35] hover:underline font-medium">contact@resgro.ai</a> or visit <a href="https://www.resgro.ai" className="text-[#FF6B35] hover:underline font-medium">www.resgro.ai</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

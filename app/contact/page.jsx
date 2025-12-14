// /app/contact/page.jsx

import React from 'react';
// Import the shared style configuration
import { STYLE_CONFIG } from '../config/styles'; 

// --- Set the Page Title/Metadata ---
export const metadata = {
  title: 'mudmuddd | Contact', 
};
// ----------------------------------------

// This component now focuses only on the Instagram and Email link
export default function ContactPage() {
  
  return (
    <div className="min-h-screen text-2xl font-sans bg-[#fdfbe0]">
      {/* HEADER: Apply text color and border-bottom */}
      <header 
        className="py-6" 
        style={{ 
          borderBottom: STYLE_CONFIG.borderStyle.borderTop, 
          color: STYLE_CONFIG.brandColor 
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          {/* Title Link: Now uses configured responsive classes */}
          <a href="/" className={STYLE_CONFIG.navLinkClasses}>mudmuddd</a>
          
          {/* Back Arrow Link: Now uses configured responsive classes and removes the <nav> wrapper */}
          <a href="/" className={STYLE_CONFIG.navLinkClasses}>&#8592;</a>
        </div>
      </header>

      {/* MAIN: Set text color for the main content block */}
      <main className="max-w-xl mx-auto py-12 px-4" style={{ color: STYLE_CONFIG.brandColor }}>        
        {/* CONTACT BOX: Use the full border and ensure inner text links use the brand color */}
        <div 
          className="p-8 rounded-lg text-center bg-[#fdfbe0]" 
          style={{ border: STYLE_CONFIG.borderStyle.border }} 
        >
          <p className="mb-6 text-lg text-gray-700">
           for questions, commissions or just to say hi, find me here : )
          </p>
          
          {/* MODIFICATION: Reduced space-y-6 to space-y-2 for less vertical space */}
          <ul className="space-y-2 text-xl">
            <li>
              {/* MODIFICATION: Removed the extra <br /> tag */}
              <a 
                href="mailto:mudmuddd.ceramics@gmail.com" 
                className="font-semibold hover:underline"
                style={{ color: STYLE_CONFIG.brandColor }} // Apply color to link
              >
                mudmuddd.ceramics@gmail.com
              </a>
            </li>
            
            <li>
              {/* MODIFICATION: Removed the extra <br /> tag */}
              <a 
                href="https://instagram.com/mudmuddd" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="font-semibold hover:underline"
                style={{ color: STYLE_CONFIG.brandColor }} // Apply color to link
              >
                @mudmuddd
              </a>
            </li>
            
            {/* --- NEW LINK ADDED HERE --- */}
            <li>
              {/* MODIFICATION: Removed the extra <br /> tag */}
              <a 
                href="https://www.instagram.com/plaza.studio.ceramique/?hl=en" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="font-semibold hover:underline"
                style={{ color: STYLE_CONFIG.brandColor }} // Apply color to link
              >
                @plaza.studio.ceramique
              </a>
            </li>
            {/* --- END NEW LINK --- */}
          </ul>
        </div>
        
      </main>

      {/* FOOTER: Apply border-top and text color */}
      <footer 
        className="py-8 mt-12" 
        style={{ 
          borderTop: STYLE_CONFIG.borderStyle.borderTop, 
          color: STYLE_CONFIG.brandColor 
        }}
      >
        <p className="text-center text-sm">© {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
// /app/page.jsx

"use client";

import React, { useState, useEffect } from 'react';
// Import the shared style configuration
import { STYLE_CONFIG } from './config/styles'; 

// --- CONFIGURATION ---
const CLOUD_NAME = "douftcirs"; 
const GALLERY_FOLDER = "dishes_archive"; 

const buildCloudinaryUrl = (publicId) => {
  const transformations = 'w_400,f_auto,q_auto:eco';
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transformations}/${publicId}`;
};

export default function Home() {
  const [ceramics, setCeramics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    const fetchCeramics = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const apiUrl = `/api/ceramics?folder=${GALLERY_FOLDER}`;
        const response = await fetch(apiUrl);

        if (!response.ok) {
            let errorDetails = `Status: ${response.status}.`;
            try {
                const errorBody = await response.json();
                errorDetails += ` Error: ${errorBody.error || 'Server error.'}`;
            } catch (e) {
                errorDetails += ' API Route failed or returned bad format.';
            }
            throw new Error(errorDetails);
        }
        
        const data = await response.json();
        setCeramics(data.resources); 
        
      } catch (err) {
        console.error("Fetch Error:", err);
        setError(`Could not load : ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchCeramics();
  }, []); 

  // The base classes for responsive font size
  const elementClasses = STYLE_CONFIG.navLinkClasses; 
  
  return (
    <div className="min-h-screen text-2xl font-sans bg-[#ff0000]">
      {/* HEADER: Apply text color and use borderTop for borderBottom */}
      <header 
        className="py-6" 
        style={{ 
          borderBottom: STYLE_CONFIG.borderStyle.borderTop,
          color: STYLE_CONFIG.brandColor // Apply color to all text inside the header
        }}
      >
        <div 
          // Default: justify-between (pushes Title to left, Links to right)
          // md:justify-evenly (distributes all three elements equally on medium screens and up) ⬅️ UPDATED
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center md:justify-evenly"
        >
          
          {/* Title: Uses the base classes for responsive font size */}
          <h1 className={elementClasses}></h1>
          
          {/* Archive Link
              - ml-auto: Pushes the link group to the right for small screens (justify-between layout).
              - mr-6: Adds space between 'archive' and 'contact' on small screens.
              - md:ml-0 md:mr-0: Resets all margins to 0 for medium screens and up.
          */}
          <a 
            href="/archive" 
            className={`${elementClasses} ml-auto mr-6 md:ml-0 md:mr-0`}
          >archive</a>
          
          {/* <a 
            href="/contact" 
            className={`${elementClasses} md:ml-0 md:mr-0`}
          >contact</a> */}
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-12 px-4" style={{ color: STYLE_CONFIG.brandColor }}>
        {loading && <div className="text-center p-8">Loading stuff...</div>}
        {error && <div className="text-red-500 text-center p-4">{error}</div>}
        {!loading && !error && ceramics.length === 0 && (
            <div className="text-center p-8">No artwork found in this folder.</div>
        )}

        {!loading && ceramics.length > 0 && (
          <div className="flex flex-wrap">
            {ceramics.map((ceramic) => (
              // Each item takes 1/2 of the width on small screens, 1/3 on medium/large
              <div 
                key={ceramic.public_id} 
                className="w-1/2 sm:w-1/2 md:w-1/3" 
                style={{ 
                  // Apply a 1px solid border using the shared brand color
                  border: `1px solid ${STYLE_CONFIG.brandColor}`
                }}
              >
                <div className="w-full h-full relative">
                  <img
                    src={buildCloudinaryUrl(ceramic.public_id)}
                    alt={ceramic.context?.alt || "Archived ceramics artwork"}
                    // Make image fill its container width and adjust height automatically
                    className="w-full h-auto object-cover"
                    loading="lazy"
                  />
                </div>
              </div>
            ))}
          </div>
          // <div className="grid grid-cols-2 md:grid-cols-3 items-center">
          //   {ceramics.map((ceramic) => (
          //     <div key={ceramic.public_id}>
          //       <div className="w-full relative flex justify-center mb-8">
          //         <img
          //           src={buildCloudinaryUrl(ceramic.public_id)}
          //           alt={ceramic.context?.alt || "Ceramics artwork"}
          //           className="w-auto h-48 object-contain"
          //           loading="lazy"
          //         />
          //       </div>
          //     </div>
          //   ))}
          // </div>
        )}
      </main>

      {/* FOOTER: Apply borderTop directly and text color */}
      {/* <footer 
        className="py-8" 
        style={{ 
          borderTop: STYLE_CONFIG.borderStyle.borderTop, // Use borderTop for the top border
          color: STYLE_CONFIG.brandColor // Apply color to all text inside the footer
        }}
      >
        <p className="text-center text-sm">© {new Date().getFullYear()} </p>
      </footer> */}
    </div>
  );
}
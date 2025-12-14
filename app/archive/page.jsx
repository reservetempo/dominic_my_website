// /app/archive/page.jsx

"use client";

import React, { useState, useEffect } from 'react';
// Import the shared style configuration
import { STYLE_CONFIG } from '../config/styles'; 

// --- CLOUDINARY CONFIGURATION (Same as homepage for now) ---
const CLOUD_NAME = "douftcirs"; 
const GALLERY_FOLDER = "ceramics"; 

const buildCloudinaryUrl = (publicId) => {
  const transformations = 'w_800,f_auto,q_auto:eco'; 
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transformations}/${publicId}`;
};

export default function ArchivePage() {
  const [ceramics, setCeramics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Function to fetch ceramic images, reused from the homepage
    const fetchCeramics = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // This API route will fetch the images for the archive
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
        setError(`Could not load archive ceramics: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchCeramics();
  }, []); 

  // Use the shared style configuration for all navigation elements
  const elementClasses = STYLE_CONFIG.navLinkClasses; 
  
  return (
    <div className="min-h-screen text-2xl font-sans bg-[#ff0000]">
      
      {/* HEADER: Uses shared styles for border and color */}
      <header 
        className="py-6" 
        style={{ 
          borderBottom: STYLE_CONFIG.borderStyle.borderTop,
          color: STYLE_CONFIG.brandColor
        }}
      >
        {/* Container keeps 'mudmuddd' left and 'arrow' right (justify-between) */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          
          {/* Title Link: Now uses configured responsive classes */}
          <a href="/" className={elementClasses}></a>
          
          {/* Back Arrow Link: Now uses configured responsive classes and removes the <nav> wrapper */}
          <a href="/" className={elementClasses}>&#8592;</a>
          
        </div>
      </header>

      {/* MAIN CONTENT: Adjusted padding for main content */}
      <main 
        className="mx-auto py-12 pt-0" // ADDED pt-0 to override py-12's top padding
        style={{ color: STYLE_CONFIG.brandColor }}
      >

        {loading && <div className="text-center p-8">Loading archive...</div>}
        {error && <div className="text-red-500 text-center p-4">{error}</div>}
        {!loading && !error && ceramics.length === 0 && (
            <div className="text-center p-8">No archive artwork found.</div>
        )}

        {!loading && ceramics.length > 0 && (
          // Use flex container to allow items to fill without gaps
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
        )}
      </main>

      {/* FOOTER: Uses shared styles for border and color */}
      {/* <footer 
        className="py-8" 
        style={{ 
          borderTop: STYLE_CONFIG.borderStyle.borderTop,
          color: STYLE_CONFIG.brandColor
        }}
      >
        <p className="text-center text-sm">© {new Date().getFullYear()} </p>
      </footer> */}
    </div>
  );
}
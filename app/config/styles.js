// /app/config/styles.js

const BRAND_COLOR = '#5d4a3e'; // Centralized color variable

export const STYLE_CONFIG = {
  // Color variables
  brandColor: BRAND_COLOR,
  
  // Border Style Configuration
  borderStyle: {
    border: `2px solid ${BRAND_COLOR}`, 
    borderTop: `2px solid ${BRAND_COLOR}`, 
  },
  
  // NEW: Navigation Link Styling
  // Size progression: text-2xl (default) -> sm:text-4xl -> md:text-5xl (for even bigger screens) ⬅️ UPDATED
  navLinkClasses: 'text-2xl sm:text-4xl md:text-5xl', 
};
// /app/api/ceramics/route.js

import { NextResponse } from 'next/server';

// FORCE NEXT.JS TO TREAT THIS ROUTE AS DYNAMIC (RUNTIME)
// This resolves the "Dynamic server usage: ... used request.url" error.
export const dynamic = 'force-dynamic'; 

export async function GET(request) {
  // 1. Retrieve variables
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "dchqagqqw";
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'Server missing API Key/Secret' },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const folderName = searchParams.get('folder') || 'mudmuddd';

    // 2. Authenticate
    const authString = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    
    // 3. Fetch from Cloudinary using POST (More stable than GET for search queries)
    // We update the expression to use public_id:prefix/* for reliable folder searching.
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({

        expression: `folder:${folderName} AND resource_type:image`,
        max_results: 30,
        sort_by: [{ created_at: 'desc' }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Cloudinary API Error:", data);
      throw new Error(data.error?.message || 'Cloudinary rejected the request');
    }

    return NextResponse.json({ resources: data.resources });

  } catch (error) {
    console.error("Final Catch Error:", error);
    return NextResponse.json(
      { error: `Backend Error: ${error.message}` },
      { status: 500 }
    );
  }
}
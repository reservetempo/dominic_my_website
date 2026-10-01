// /app/blog/page.jsx

import { POSTS } from './posts';

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-white text-black font-sans">
      <main className="max-w-3xl mx-auto py-12 px-4">
        <h1 className="text-4xl font-bold mb-8">blog</h1>
        <ul>
          {POSTS.map((post) => (
            <li key={post.slug} className="border-b border-gray-200">
              <a href={`/blog/${post.slug}`} className="flex justify-between items-baseline py-4 hover:underline">
                <span className="text-2xl">{post.title}</span>
                <span className="text-sm text-gray-500">{post.date}</span>
              </a>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

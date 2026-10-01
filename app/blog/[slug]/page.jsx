// /app/blog/[slug]/page.jsx

import { notFound } from 'next/navigation';
import { marked } from 'marked';
import { POSTS, getPost } from '../posts';

// Tailwind's preflight strips default heading/list styles, so restore the basics for rendered markdown
const CONTENT_CLASSES = [
  '[&_h1]:text-4xl [&_h1]:font-bold [&_h1]:my-4',
  '[&_h2]:text-3xl [&_h2]:font-bold [&_h2]:my-3',
  '[&_h3]:text-2xl [&_h3]:font-bold [&_h3]:my-2',
  '[&_p]:my-3',
  '[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6',
  '[&_a]:underline',
  '[&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic',
  '[&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded',
  '[&_pre]:bg-gray-100 [&_pre]:p-4 [&_pre]:my-3 [&_pre]:overflow-x-auto',
  '[&_img]:max-w-full [&_img]:my-4',
  '[&_hr]:my-6',
].join(' ');

export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.slug }));
}

export function generateMetadata({ params }) {
  const post = getPost(params.slug);
  return { title: post ? post.title : 'Post not found' };
}

export default function BlogPostPage({ params }) {
  const post = getPost(params.slug);
  if (!post) notFound();

  return (
    <div className="min-h-screen bg-white text-black font-sans">
      <main className="max-w-3xl mx-auto py-12 px-4">
        <a href="/blog" className="text-sm text-gray-500 hover:underline">← all posts</a>
        <h1 className="text-4xl font-bold mt-6">{post.title}</h1>
        <p className="text-sm text-gray-500 mt-2 mb-8">{post.date}</p>
        <article
          className={`text-lg ${CONTENT_CLASSES}`}
          dangerouslySetInnerHTML={{ __html: marked.parse(post.content) }}
        />
      </main>
    </div>
  );
}

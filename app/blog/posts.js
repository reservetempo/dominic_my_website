// /app/blog/posts.js

// Hardcoded blog posts. Newest first. `content` is markdown.
// `slug` becomes the URL: /blog/<slug>
export const POSTS = [
  {
    slug: 'second-post',
    title: 'Second Post',
    date: '2026-10-01',
    content: `
This is the second post.

- Lists work
- **Bold** and *italic* work too

> So do quotes.
`,
  },
  {
    slug: 'first-post',
    title: 'First Post',
    date: '2026-09-01',
    content: `
Hello! This is the first post on the blog.

Write posts in markdown and add them to the \`POSTS\` array in \`app/blog/posts.js\`.
`,
  },
];

export const getPost = (slug) => POSTS.find((post) => post.slug === slug);

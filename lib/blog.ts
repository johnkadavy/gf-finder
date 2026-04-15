import fs from "fs";
import path from "path";
import matter from "gray-matter";

const BLOG_DIR = path.join(process.cwd(), "content/blog");

export type PostMeta = {
  slug: string;
  title: string;
  date: string;
  description: string;
};

export type Post = PostMeta & {
  content: string;
};

function readPostFile(filename: string): Post | null {
  if (filename.startsWith("_") || !filename.endsWith(".md")) return null;
  const slug = filename.replace(/\.md$/, "");
  const raw = fs.readFileSync(path.join(BLOG_DIR, filename), "utf-8");
  const { data, content } = matter(raw);
  if (!data.title || !data.date) return null;
  return {
    slug: data.slug ?? slug,
    title: data.title,
    date: data.date,
    description: data.description ?? "",
    content,
  };
}

export function getAllPosts(): PostMeta[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .map(readPostFile)
    .filter((p): p is Post => p !== null)
    .sort((a, b) => (a.date > b.date ? -1 : 1))
    .map(({ slug, title, date, description }) => ({ slug, title, date, description }));
}

export function getPost(slug: string): Post | null {
  if (!fs.existsSync(BLOG_DIR)) return null;
  const files = fs.readdirSync(BLOG_DIR);
  for (const filename of files) {
    const post = readPostFile(filename);
    if (post?.slug === slug) return post;
  }
  return null;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

import type { Config } from "@react-router/dev/config";
import fs from 'fs';
import path from 'path';

export default {
  ssr: false,
  prerender: [
    "/",
    "/faq",
    "/ideas",
    "/admin",
    "/blog",
    ...getBlogSlugs().map(s => `/blog/${s}`),
  ],
} satisfies Config;

function getBlogSlugs(): string[] {
  const blogDir = path.resolve(process.cwd(), "content", "blog");
  if (!fs.existsSync(blogDir)) return [];
  return fs.readdirSync(blogDir)
    .filter(f => f.endsWith(".md"))
    .map(f => f.replace(/\.md$/, ""));
}

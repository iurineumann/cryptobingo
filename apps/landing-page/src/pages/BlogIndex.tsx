import { Link, useLoaderData } from 'react-router-dom';
import { loadBlogPosts } from '../../lib/content';
import type { BlogPost } from '../../lib/content';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';

export async function loader(): Promise<{ posts: BlogPost[] }> {
  return { posts: loadBlogPosts() };
}

export default function BlogIndex() {
  const { posts } = useLoaderData<typeof loader>();

  return (
    <>
      <Seo title="Blog — CryptoBingo" description="Novidades, atualizações e artigos sobre o CryptoBingo Bingo GameFi na WAX." canonical="/blog" />
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Blog</h1>
        <p className="text-slate-400 mb-12">Novidades e atualizações do CryptoBingo</p>
        <div className="grid gap-8">
          {posts.map((post) => (
            <Link
              key={post.slug}
              to={`/blog/${post.slug}`}
              className="block bg-surface-800 rounded-xl border border-surface-700/50 p-6 hover:border-surface-500 transition-all hover:-translate-y-0.5"
            >
              <time className="text-xs text-slate-500">
                {new Date(post.date).toLocaleDateString('pt-BR')}
              </time>
              <h2 className="text-xl font-semibold text-white mt-1 mb-2">{post.title}</h2>
              <p className="text-sm text-slate-400">{post.description}</p>
              <div className="flex gap-2 mt-3">
                {post.tags.map((tag: string) => (
                  <span key={tag} className="text-xs bg-brand-500/10 text-brand-300 px-2 py-0.5 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}

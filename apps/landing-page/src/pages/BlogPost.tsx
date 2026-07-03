import { Link, useLoaderData } from 'react-router-dom';
import { loadBlogPost } from '../../lib/content';
import type { BlogPost } from '../../lib/content';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';

export async function loader({ params }: { params: Record<string, string | undefined> }): Promise<{ post: BlogPost | null }> {
  const post = loadBlogPost(params.slug || '');
  return { post };
}

export default function BlogPost() {
  const { post } = useLoaderData<typeof loader>();

  if (!post) {
    return (
      <>
        <Header />
        <main className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-white">Post não encontrado</h1>
          <Link to="/blog" className="text-brand-400 hover:text-brand-300 mt-4 inline-block">
            ← Voltar ao blog
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Seo title={`${post.title} — CryptoBingo`} description={post.description} canonical={`/blog/${post.slug}`} />
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-20">
        <Link to="/blog" className="text-sm text-brand-400 hover:text-brand-300 mb-8 inline-block">
          ← Voltar ao blog
        </Link>
        <article>
          <time className="text-xs text-slate-500">
            {new Date(post.date).toLocaleDateString('pt-BR')}
          </time>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mt-2 mb-4">
            {post.title}
          </h1>
          <div className="flex gap-2 mb-6">
            {post.tags.map((tag: string) => (
              <span key={tag} className="text-xs bg-brand-500/10 text-brand-300 px-2 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
          </div>
          <div className="prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed">
            {post.body.split('\n').map((line, i) => {
              if (line.startsWith('## ')) {
                return <h2 key={i} className="text-xl font-semibold text-white mt-8 mb-4">{line.slice(3)}</h2>;
              }
              if (line.startsWith('### ')) {
                return <h3 key={i} className="text-lg font-semibold text-white mt-6 mb-3">{line.slice(4)}</h3>;
              }
              if (line.startsWith('- ')) {
                return <li key={i} className="text-slate-300 ml-4">{line.slice(2)}</li>;
              }
              if (line.match(/^\d+\. /)) {
                const content = line.replace(/^\d+\.\s*/, '');
                return <li key={i} className="text-slate-300 ml-4 list-decimal">{content}</li>;
              }
              if (line.trim() === '') return null;
              return <p key={i} className="mb-3">{line}</p>;
            })}
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}

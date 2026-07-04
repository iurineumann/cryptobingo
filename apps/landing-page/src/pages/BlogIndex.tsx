import { useTranslation } from 'react-i18next';
import { useLoaderData, useParams, Link } from 'react-router-dom';
import { loadBlogPosts } from '../../lib/content';
import type { BlogPost as BlogPostType } from '../../lib/content';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';
import { useAnalytics } from '@/hooks/useAnalytics';

export async function loader({ params }: { params: { locale?: string } }): Promise<{ posts: BlogPostType[] }> {
  const locale = params.locale || 'en';
  return { posts: loadBlogPosts(locale) };
}

function formatDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr);
  const fmt = locale === 'pt' ? 'pt-BR' : locale === 'zh' ? 'zh-CN' : 'en-US';
  return d.toLocaleDateString(fmt, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function BlogIndex() {
  const { t } = useTranslation();
  const { posts } = useLoaderData<typeof loader>();
  const { locale } = useParams();
  const lang = locale || 'en';
  const { trackEvent } = useAnalytics(lang);

  return (
    <>
      <Seo title={t('seo.blog_title')} description={t('seo.blog_desc')} canonical={`/${lang}/blog`} />
      <Header />
      <main id="main-content" className="max-w-6xl mx-auto px-4 py-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-8">
          {t('seo.blog_title')}
        </h1>
        <div data-testid="blog-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <Link
              key={post.slug}
              to={`/${lang}/blog/${post.slug}`}
              onClick={() => trackEvent('blog_click', { post_slug: post.slug, post_title: post.title })}
              className="group block bg-surface-800 rounded-xl border border-surface-700/50 hover:border-surface-500 transition-all overflow-hidden"
            >
              <div className="aspect-video bg-surface-700 overflow-hidden">
                {post.cover ? (
                  <img
                    src={post.cover}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500 text-lg font-semibold">
                    {post.title.charAt(0)}
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="flex flex-wrap gap-2 mb-3">
                  {post.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <h2 className="text-lg font-semibold text-white mb-2 group-hover:text-brand-300 transition-colors">
                  {post.title}
                </h2>
                <p className="text-slate-400 text-sm mb-3 line-clamp-2">{post.description}</p>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{formatDate(post.date, lang)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{post.author}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}

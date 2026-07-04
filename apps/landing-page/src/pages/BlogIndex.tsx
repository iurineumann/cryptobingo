import { useTranslation } from 'react-i18next';
import { useLoaderData, useParams, Link } from 'react-router-dom';
import { loadBlogPosts } from '../../lib/content';
import type { BlogPost as BlogPostType } from '../../lib/content';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';

export async function loader({ params }: { params: { locale?: string } }): Promise<{ posts: BlogPostType[] }> {
  const locale = params.locale || 'en';
  return { posts: loadBlogPosts(locale) };
}

export default function BlogIndex() {
  const { t } = useTranslation();
  const { posts } = useLoaderData<typeof loader>();
  const { locale } = useParams();
  const lang = locale || 'en';

  return (
    <>
      <Seo title={t('seo.blog_title')} description={t('seo.blog_desc')} canonical={`/${lang}/blog`} />
      <Header />
      <main id="main-content" className="max-w-4xl mx-auto px-4 py-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-8">
          {t('seo.blog_title')}
        </h1>
        <div className="grid gap-6">
          {posts.map((post) => (
            <Link
              key={post.slug}
              to={`/${lang}/blog/${post.slug}`}
              className="block bg-surface-800 rounded-xl p-6 border border-surface-700/50 hover:border-surface-500 transition-all"
            >
              <h2 className="text-xl font-semibold text-white mb-2">{post.title}</h2>
              <p className="text-slate-400 text-sm">{post.description}</p>
            </Link>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}

import { useTranslation } from 'react-i18next';
import { useLoaderData, useParams } from 'react-router-dom';
import { loadBlogPost, computeRelatedPosts } from '../../lib/content';
import type { BlogPost as BlogPostType, RelatedPost } from '../../lib/content';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';
import { ContentHeader } from '@/components/ContentHeader';
import { ContentBody } from '@/components/ContentBody';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { RelatedContent } from '@/components/RelatedContent';
import { PrevNextNav } from '@/components/PrevNextNav';
import { trackEvent } from '@/services/analytics';

export async function loader({ params }: { params: { slug: string; locale?: string } }): Promise<{
  post: BlogPostType;
  relatedPosts: RelatedPost[];
} | null> {
  const locale = params.locale || 'en';
  const post = loadBlogPost(params.slug, locale);
  if (!post) return null;
  const relatedPosts = computeRelatedPosts(params.slug, locale, 'blog');
  return { post, relatedPosts };
}

export default function BlogPost() {
  const { t } = useTranslation();
  const data = useLoaderData<typeof loader>();
  const { locale, slug } = useParams();
  const lang = locale || 'en';

  if (!data) {
    return (
      <>
        <Header />
        <main id="main-content" className="max-w-3xl mx-auto px-4 py-20">
          <h1 className="text-3xl font-bold text-white">Post not found</h1>
        </main>
        <Footer />
      </>
    );
  }

  const { post, relatedPosts } = data;

  const words = (post.body || '').replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean).length;
  const readTime = Math.max(1, Math.ceil(words / 200));
  const readTimeLabel = t('content.readTime', { count: readTime });

  return (
    <>
      <Seo
        title={post.title}
        description={post.description}
        canonical={`/${lang}/blog/${slug}`}
      />
      <Header />
      <main id="main-content" className="max-w-3xl mx-auto px-4 py-20">
        <Breadcrumbs
          segments={[
            { label: t('nav.home'), href: `/${lang}` },
            { label: t('nav.blog'), href: `/${lang}/blog` },
            { label: post.title },
          ]}
        />
        <article>
          <ContentHeader
            title={post.title}
            description={post.description}
            cover={post.cover}
            author={post.author}
            date={post.date}
            tags={post.tags}
            readTime={readTime}
            readTimeLabel={readTimeLabel}
          />
          <ContentBody html={post.body} />
        </article>

        <RelatedContent items={relatedPosts} type="blog" locale={lang} />
        <PrevNextNav locale={lang} basePath={`/${lang}/blog`} />

        <div className="mt-12 pt-8 border-t border-gray-800">
          <a
            href={`/${lang}/blog`}
            className="text-brand-400 hover:text-brand-300 transition-colors"
            onClick={() => trackEvent('blog_click', { post_slug: post.slug })}
          >
            ← {t('blog.back')}
          </a>
        </div>
      </main>
      <Footer />
    </>
  );
}

import { useTranslation } from 'react-i18next';
import { useLoaderData, useParams } from 'react-router-dom';
import { loadBlogPost } from '../../lib/content';
import type { BlogPost as BlogPostType } from '../../lib/content';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';

export async function loader({ params }: { params: { slug: string; locale?: string } }): Promise<BlogPostType | null> {
  const locale = params.locale || 'en';
  return loadBlogPost(params.slug, locale);
}

export default function BlogPost() {
  const { t } = useTranslation();
  const post = useLoaderData<typeof loader>();
  const { locale, slug } = useParams();
  const lang = locale || 'en';

  if (!post) {
    return (
      <>
        <Header />
        <main className="max-w-3xl mx-auto px-4 py-20">
          <h1 className="text-3xl font-bold text-white">Post not found</h1>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Seo title={post.title} description={post.description} canonical={`/${lang}/blog/${slug}`} />
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-20">
        <article>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">{post.title}</h1>
          <p className="text-slate-400 mb-8">{post.description}</p>
          <div className="prose prose-invert max-w-none">
            {post.body.split('\n').map((p, i) => (
              <p key={i} className="mb-4 text-slate-300 leading-relaxed">{p}</p>
            ))}
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}

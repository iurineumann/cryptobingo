import type { RouteConfig } from '@react-router/dev/routes';
import { prefix, route, index } from '@react-router/dev/routes';

export default [
  index('../src/pages/RedirectRoot.tsx'),
  route('ref/:code', '../src/pages/ReferralRedirect.tsx', { id: 'referral-redirect' }),
  ...prefix(':locale', [
    index('../src/pages/HomePage.tsx', { id: 'home' }),
    route('faq', '../src/pages/FaqPage.tsx', { id: 'faq' }),
    route('blog', '../src/pages/BlogIndex.tsx', { id: 'blog-index' }),
    route('blog/:slug', '../src/pages/BlogPost.tsx', { id: 'blog-post' }),
    route('ideas', '../src/pages/IdeasPage.tsx', { id: 'ideas' }),
    route('admin', '../src/pages/AdminPage.tsx', { id: 'admin' }),
    route('whitepaper', '../src/pages/WhitepaperPage.tsx', { id: 'whitepaper' }),
    route('tutorials', '../src/pages/TutorialsIndex.tsx', { id: 'tutorials' }),
    route('tutorials/:slug', '../src/pages/TutorialPost.tsx', { id: 'tutorial-post' }),
    route(':slug', '../src/pages/PageView.tsx', { id: 'page-view' }),
  ]),
] satisfies RouteConfig;

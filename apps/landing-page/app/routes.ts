import type { RouteConfig } from '@react-router/dev/routes';

export default [
  { path: '/', file: '../src/pages/HomePage.tsx', id: 'home' },
  { path: '/faq', file: '../src/pages/FaqPage.tsx', id: 'faq' },
  { path: '/blog', file: '../src/pages/BlogIndex.tsx', id: 'blog-index' },
  { path: '/blog/:slug', file: '../src/pages/BlogPost.tsx', id: 'blog-post' },
  { path: '/ideas', file: '../src/pages/IdeasPage.tsx', id: 'ideas' },
  { path: '/admin', file: '../src/pages/AdminPage.tsx', id: 'admin' },
  { path: '/ref/:code', file: '../src/pages/ReferralRedirect.tsx', id: 'referral-redirect' },
] satisfies RouteConfig;

import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Seo from '@/components/Seo';

const brandColors = [
  { label: 'Primary', hex: '#8B5CF6' },
  { label: 'Secondary', hex: '#06B6D4' },
  { label: 'Accent', hex: '#F59E0B' },
  { label: 'Surface', hex: '#1E293B' },
];

export default function PressKitPage() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const lang = locale || 'en';

  return (
    <>
      <Seo title={t('press_kit.title')} description={t('press_kit.description')} canonical={`/${lang}/press-kit`} />
      <Header />
      <main id="main-content" className="max-w-5xl mx-auto px-4 py-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
          {t('press_kit.title')}
        </h1>
        <p className="text-slate-400 mb-16">
          {t('press_kit.description')}
        </p>

        <section className="mb-16">
          <h2 className="text-2xl font-semibold text-white mb-4">
            {t('press_kit.brand_title')}
          </h2>
          <p className="text-slate-400 mb-8">
            {t('press_kit.brand_desc')}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {brandColors.map((color) => (
              <div key={color.label} className="bg-surface-800 rounded-xl border border-surface-700/50 p-4 text-center">
                <div
                  className="w-12 h-12 rounded-lg mx-auto mb-3"
                  style={{ backgroundColor: color.hex }}
                />
                <p className="text-white text-sm font-medium">{color.label}</p>
                <p className="text-slate-400 text-xs">{color.hex}</p>
              </div>
            ))}
          </div>
          <div className="bg-surface-800 rounded-xl border border-surface-700/50 p-6">
            <h3 className="text-white font-medium mb-2">Typography</h3>
            <p className="text-slate-400 text-sm">
              Geist Variable — <span className="text-white">ABCDEFGHIJKLMNOPQRSTUVWXYZ</span>{' '}
              <span className="text-slate-300">abcdefghijklmnopqrstuvwxyz 0123456789</span>
            </p>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-semibold text-white mb-6">
            {t('press_kit.screenshots_title')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="aspect-video bg-surface-800 rounded-xl border border-surface-700/50 flex items-center justify-center"
              >
                <span className="text-slate-500 text-sm">Screenshot {i}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-semibold text-white mb-6">Downloads</h2>
          <div className="flex flex-wrap gap-4">
            <button
              data-testid="download-logo"
              className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium transition-colors cursor-pointer"
            >
              {t('press_kit.download_logo')}
            </button>
            <button
              data-testid="download-icon"
              className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-medium transition-colors cursor-pointer"
            >
              {t('press_kit.download_icon')}
            </button>
            <button
              data-testid="download-screenshots"
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition-colors cursor-pointer"
            >
              {t('press_kit.download_screenshots')}
            </button>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-semibold text-white mb-2">
            {t('press_kit.guidelines_title')}
          </h2>
          <p className="text-slate-400 mb-8">
            {t('press_kit.guidelines_desc')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-6">
              <h3 className="text-green-400 font-semibold text-lg mb-4">✓ {t('press_kit.do_title')}</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3 text-slate-300">
                  <span className="text-green-400 mt-0.5">✓</span>
                  {t('press_kit.do_1')}
                </li>
                <li className="flex items-start gap-3 text-slate-300">
                  <span className="text-green-400 mt-0.5">✓</span>
                  {t('press_kit.do_2')}
                </li>
                <li className="flex items-start gap-3 text-slate-300">
                  <span className="text-green-400 mt-0.5">✓</span>
                  {t('press_kit.do_3')}
                </li>
              </ul>
            </div>
            <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-6">
              <h3 className="text-red-400 font-semibold text-lg mb-4">✗ {t('press_kit.dont_title')}</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3 text-slate-300">
                  <span className="text-red-400 mt-0.5">✗</span>
                  {t('press_kit.dont_1')}
                </li>
                <li className="flex items-start gap-3 text-slate-300">
                  <span className="text-red-400 mt-0.5">✗</span>
                  {t('press_kit.dont_2')}
                </li>
                <li className="flex items-start gap-3 text-slate-300">
                  <span className="text-red-400 mt-0.5">✗</span>
                  {t('press_kit.dont_3')}
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-white mb-2">
            {t('press_kit.media_title')}
          </h2>
          <p className="text-slate-400 mb-4">
            {t('press_kit.media_desc')}
          </p>
          <a
            data-testid="media-email"
            href="mailto:press@cryptobingo.bet"
            className="text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors"
          >
            {t('press_kit.media_email')}
          </a>
        </section>
      </main>
      <Footer />
    </>
  );
}

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import pt from './locales/pt.json';
import zh from './locales/zh.json';

i18n
    .use(initReactI18next)
    .init({
        resources: {
            'en-US': { translation: en },
            'pt-BR': { translation: pt },
            'zh-CN': { translation: zh },
        },
        lng:          'pt-BR',
        fallbackLng:  'en-US',
        interpolation: { escapeValue: false },
    });

export default i18n;

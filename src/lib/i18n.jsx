import React, { createContext, useContext, useMemo } from 'react';
import { translations } from './i18n/translations';

const I18nContext = createContext(null);

const format = (value, vars = {}) => {
  if (!value) return value;
  return String(value).replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] ?? ''));
};

export const I18nProvider = ({ children }) => {
  const value = useMemo(() => {
    const dict = translations.de;
    const t = (key, vars) => {
      const parts = key.split('.');
      let current = dict;
      for (const part of parts) {
        current = current?.[part];
      }
      if (current == null) {
        return format(key, vars);
      }
      return format(current, vars);
    };
    return {
      language: 'de',
      t
    };
  }, []);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
};

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';
import { createPageUrl } from '@/utils';

export default function Login() {
  const { isLoadingAuth, isAuthenticated, login } = useAuth();
  const { t } = useI18n();
  const [stage, setStage] = useState('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const returnTo = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('return_to') || createPageUrl('Home');
  }, [location.search]);

  const isLocalLogin = (value) => {
    const trimmed = String(value || '').trim().toLowerCase();
    if (!trimmed) return false;
    if (!trimmed.includes('@')) return true;
    return trimmed.endsWith('@local');
  };

  const normalizeLocalEmail = (value) => {
    const trimmed = String(value || '').trim().toLowerCase();
    if (!trimmed) return '';
    if (trimmed.includes('@')) return trimmed;
    return `${trimmed}@local`;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const value = email.trim();

    if (stage === 'email') {
      if (!value) {
        setError(t('auth.emailOrUser'));
        return;
      }

      setError(null);
      if (isLocalLogin(value)) {
        setStage('password');
        return;
      }

      setIsSubmitting(true);
      try {
        await login({ email: value, mode: 'entra' });
      } catch (err) {
        setError(err.message || t('auth.loginFailed'));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    setError(null);
    try {
      await login({
        email: normalizeLocalEmail(email),
        password,
        mode: 'local'
      });
    } catch (err) {
      setError(err.message || t('auth.loginFailed'));
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      navigate(returnTo, { replace: true });
    }
  }, [isAuthenticated, navigate, returnTo]);

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm max-w-md w-full text-center space-y-4">
        <h2 className="text-xl font-semibold text-slate-800">{t('common.login')}</h2>
          <form className="space-y-3 text-left" onSubmit={handleSubmit}>
          <p className="text-slate-600 text-center">
            {t('auth.enterEmail')}
          </p>
          <div className="space-y-2">
            <Input
              type="email"
              placeholder={t('auth.emailOrUser')}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={stage === 'password'}
            />
            {stage === 'password' && (
              <Input
                type="password"
                placeholder={t('auth.password')}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
            {error && (
              <div className="text-sm text-red-600 text-center">
                {error}
              </div>
            )}
            {stage === 'email' ? (
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
              >
                {t('auth.next')}
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setStage('email');
                    setPassword('');
                    setError(null);
                  }}
                  className="flex-1"
                >
                  {t('auth.back')}
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={!password}
                >
                  {t('auth.signIn')}
                </Button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

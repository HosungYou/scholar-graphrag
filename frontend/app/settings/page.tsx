'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon, Monitor, Database, Cpu, Globe, Key, Eye, EyeOff, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Header, Footer } from '@/components/layout';
import { ThemeToggle, ErrorBoundary } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';

type KeyStatus = 'unknown' | 'valid' | 'invalid' | 'testing';

interface ProviderStatus {
  provider: string;
  configured: boolean;
  model: string;
}

export default function SettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [llmProvider, setLlmProvider] = useState('anthropic');
  const [language, setLanguage] = useState('ko');

  // API Key management state
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
    anthropic: '',
    openai: '',
    google: '',
  });
  const [keyStatuses, setKeyStatuses] = useState<Record<string, KeyStatus>>({
    anthropic: 'unknown',
    openai: 'unknown',
    google: 'unknown',
  });
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({
    anthropic: false,
    openai: false,
    google: false,
  });
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);

  const themeOptions = [
    { value: 'light' as const, label: '라이트 모드', icon: Sun, description: '항상 밝은 테마 사용' },
    { value: 'dark' as const, label: '다크 모드', icon: Moon, description: '항상 어두운 테마 사용' },
    { value: 'system' as const, label: '시스템 설정', icon: Monitor, description: '시스템 설정에 따라 자동 전환' },
  ];

  const llmOptions = [
    { value: 'anthropic', label: 'Claude (Anthropic)', description: 'Claude 3.5 Haiku' },
    { value: 'openai', label: 'GPT-4 (OpenAI)', description: 'GPT-4o' },
    { value: 'google', label: 'Gemini (Google)', description: 'Gemini 1.5 Pro' },
  ];

  const languageOptions = [
    { value: 'ko', label: '한국어', flag: '🇰🇷' },
    { value: 'en', label: 'English', flag: '🇺🇸' },
  ];

  // Fetch provider status on mount
  useEffect(() => {
    fetchProviderStatus();
  }, []);

  const fetchProviderStatus = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/settings/providers');
      if (response.ok) {
        const data = await response.json();
        setProviderStatuses(data);

        // Update key statuses based on configured state
        const newStatuses: Record<string, KeyStatus> = {};
        data.forEach((provider: ProviderStatus) => {
          newStatuses[provider.provider] = provider.configured ? 'valid' : 'unknown';
        });
        setKeyStatuses(newStatuses);
      }
    } catch (error) {
      console.error('Failed to fetch provider status:', error);
    }
  };

  const testApiKey = async (provider: string) => {
    const apiKey = apiKeys[provider];
    if (!apiKey.trim()) {
      return;
    }

    setKeyStatuses(prev => ({ ...prev, [provider]: 'testing' }));

    try {
      const response = await fetch('http://localhost:8000/api/settings/validate-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider,
          api_key: apiKey,
        }),
      });

      const result = await response.json();
      setKeyStatuses(prev => ({ ...prev, [provider]: result.valid ? 'valid' : 'invalid' }));

      // Show error message if invalid
      if (!result.valid && result.error) {
        console.error(`API key validation failed for ${provider}:`, result.error);
      }
    } catch (error) {
      console.error('API key test failed:', error);
      setKeyStatuses(prev => ({ ...prev, [provider]: 'invalid' }));
    }
  };

  const toggleShowKey = (provider: string) => {
    setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  const handleKeyChange = (provider: string, value: string) => {
    setApiKeys(prev => ({ ...prev, [provider]: value }));
    // Reset status when key changes
    if (keyStatuses[provider] !== 'unknown') {
      setKeyStatuses(prev => ({ ...prev, [provider]: 'unknown' }));
    }
  };

  const getStatusIcon = (status: KeyStatus) => {
    switch (status) {
      case 'valid':
        return <CheckCircle className="w-4 h-4 text-teal" />;
      case 'invalid':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'testing':
        return <Loader2 className="w-4 h-4 text-copper animate-spin" />;
      default:
        return <div className="w-2 h-2 rounded-full bg-text-tertiary" />;
    }
  };

  const getStatusText = (status: KeyStatus, configured: boolean) => {
    if (configured && status === 'valid') return '구성됨';
    if (status === 'valid') return '유효함';
    if (status === 'invalid') return '유효하지 않음';
    if (status === 'testing') return '테스트 중...';
    return '미구성';
  };

  return (
    <div className="min-h-screen bg-surface-0 flex flex-col">
      <a href="#main-content" className="skip-link">
        메인 콘텐츠로 건너뛰기
      </a>

      <Header
        breadcrumbs={[{ label: 'Settings' }]}
        rightContent={<ThemeToggle variant="dropdown" />}
      />

      <main id="main-content" className="flex-1 max-w-3xl mx-auto px-4 py-6 sm:py-8 w-full">
        <ErrorBoundary>
          <div className="mb-8">
            <p className="font-mono text-[11px] text-copper tracking-[0.15em] uppercase mb-3">Configuration</p>
            <h2 className="text-lg font-medium text-text-primary">설정</h2>
          </div>

          <div className="space-y-6">
            {/* Theme Settings */}
            <section className="bg-surface-1 rounded border border-border p-5 sm:p-6">
              <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
                <Sun className="w-5 h-5 text-copper" />
                테마 설정
              </h3>
              <div className="grid sm:grid-cols-3 gap-3">
                {themeOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = theme === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setTheme(option.value)}
                      className={`
                        p-4 rounded border text-left transition-colors touch-target
                        ${isSelected
                          ? 'border-teal bg-teal-dim'
                          : 'border-border hover:border-border-hover'
                        }
                      `}
                      aria-pressed={isSelected}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Icon className={`w-5 h-5 ${isSelected ? 'text-teal' : 'text-text-tertiary'}`} />
                        <span className={`font-medium ${isSelected ? 'text-teal' : 'text-text-primary'}`}>
                          {option.label}
                        </span>
                      </div>
                      <p className="text-xs text-text-tertiary">
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* API Keys Section */}
            <section className="bg-surface-1 rounded border border-border p-5 sm:p-6">
              <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
                <Key className="w-5 h-5 text-copper" />
                API 키 관리
              </h3>
              <div className="space-y-4">
                {llmOptions.map((option) => {
                  const provider = option.value;
                  const status = keyStatuses[provider];
                  const providerStatus = providerStatuses.find(p => p.provider === provider);
                  const isConfigured = providerStatus?.configured || false;

                  return (
                    <div key={provider} className="border border-border rounded p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-primary">{option.label}</span>
                          <div className="flex items-center gap-1.5">
                            {getStatusIcon(status)}
                            <span className="text-xs text-text-tertiary">
                              {getStatusText(status, isConfigured)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <div className="flex-1 relative">
                            <input
                              type={showKeys[provider] ? 'text' : 'password'}
                              value={apiKeys[provider]}
                              onChange={(e) => handleKeyChange(provider, e.target.value)}
                              placeholder={isConfigured ? '환경변수로 구성됨' : 'API 키를 입력하세요'}
                              className="w-full px-3 py-2 bg-surface-0 border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-teal"
                            />
                            <button
                              onClick={() => toggleShowKey(provider)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary transition-colors"
                              aria-label={showKeys[provider] ? '키 숨기기' : '키 표시'}
                            >
                              {showKeys[provider] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <button
                            onClick={() => testApiKey(provider)}
                            disabled={!apiKeys[provider].trim() || status === 'testing'}
                            className="px-4 py-2 bg-teal text-surface-0 rounded text-sm font-medium hover:bg-teal/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {status === 'testing' ? '테스트 중...' : '테스트'}
                          </button>
                        </div>
                        <p className="text-xs text-text-tertiary">
                          {option.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-xs text-text-tertiary">
                참고: API 키는 서버의 환경 변수로 설정됩니다. 여기서는 테스트만 가능합니다.
              </p>
            </section>

            {/* LLM Provider Settings */}
            <section className="bg-surface-1 rounded border border-border p-5 sm:p-6">
              <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-node-concept" />
                AI 모델 설정
              </h3>
              <div className="space-y-3">
                {llmOptions.map((option) => {
                  const isSelected = llmProvider === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setLlmProvider(option.value)}
                      className={`
                        w-full p-4 rounded border text-left transition-colors flex items-center justify-between touch-target
                        ${isSelected
                          ? 'border-teal bg-teal-dim'
                          : 'border-border hover:border-border-hover'
                        }
                      `}
                      aria-pressed={isSelected}
                    >
                      <div>
                        <span className={`font-medium ${isSelected ? 'text-teal' : 'text-text-primary'}`}>
                          {option.label}
                        </span>
                        <p className="text-xs text-text-tertiary mt-1">
                          {option.description}
                        </p>
                      </div>
                      {isSelected && (
                        <span className="text-teal text-lg">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-xs text-text-tertiary">
                선택한 AI 모델은 채팅 및 엔티티 추출에 사용됩니다.
              </p>
            </section>

            {/* Language Settings */}
            <section className="bg-surface-1 rounded border border-border p-5 sm:p-6">
              <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-node-author" />
                언어 설정
              </h3>
              <div className="flex gap-3">
                {languageOptions.map((option) => {
                  const isSelected = language === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setLanguage(option.value)}
                      className={`
                        flex-1 p-4 rounded border text-center transition-colors touch-target
                        ${isSelected
                          ? 'border-teal bg-teal-dim'
                          : 'border-border hover:border-border-hover'
                        }
                      `}
                      aria-pressed={isSelected}
                    >
                      <span className="text-2xl mb-2 block">{option.flag}</span>
                      <span className={`font-medium ${isSelected ? 'text-teal' : 'text-text-primary'}`}>
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Database Info */}
            <section className="bg-surface-1 rounded border border-border p-5 sm:p-6">
              <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
                <Database className="w-5 h-5 text-node-paper" />
                데이터베이스 정보
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-text-tertiary">데이터베이스</span>
                  <span className="text-text-primary font-mono">PostgreSQL + pgvector</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border">
                  <span className="text-text-tertiary">호스팅</span>
                  <span className="text-text-primary font-mono">Supabase</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-text-tertiary">벡터 차원</span>
                  <span className="text-text-primary font-mono">1536</span>
                </div>
              </div>
            </section>
          </div>
        </ErrorBoundary>
      </main>

      <Footer minimal />
    </div>
  );
}

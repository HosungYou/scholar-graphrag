'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings, Sun, Moon, Monitor, Database, Cpu, Globe, Key, Eye, EyeOff, Check, X, Loader2, AlertCircle, BarChart3 } from 'lucide-react';
import { Header, Footer } from '@/components/layout';
import { ThemeToggle, ErrorBoundary } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/lib/api';
import type { QueryMetrics } from '@/types';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [language, setLanguage] = useState('ko');

  // API Keys state
  const [apiKeys, setApiKeys] = useState<Array<{
    provider: string;
    display_name: string;
    is_set: boolean;
    masked_key: string | null;
    source: 'user' | 'server' | null;
    usage: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{valid: boolean; message: string} | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // LLM preferences
  const [llmProvider, setLlmProvider] = useState('groq');
  const [providerSaving, setProviderSaving] = useState(false);

  // Query Metrics state
  const [queryMetrics, setQueryMetrics] = useState<QueryMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const themeOptions = [
    { value: 'light' as const, label: '라이트 모드', icon: Sun, description: '항상 밝은 테마 사용' },
    { value: 'dark' as const, label: '다크 모드', icon: Moon, description: '항상 어두운 테마 사용' },
    { value: 'system' as const, label: '시스템 설정', icon: Monitor, description: '시스템 설정에 따라 자동 전환' },
  ];

  const llmOptions = [
    { value: 'groq', label: 'Groq (Llama)', description: 'Llama 3.3 70B - 무료, 가장 빠른 추론', model: 'llama-3.3-70b-versatile' },
    { value: 'anthropic', label: 'Claude (Anthropic)', description: 'Claude Haiku 4.5', model: 'claude-haiku-4-5-20251001' },
    { value: 'openai', label: 'GPT-4 (OpenAI)', description: 'GPT-4o', model: 'gpt-4o' },
    { value: 'google', label: 'Gemini (Google)', description: 'Gemini 1.5 Pro', model: 'gemini-1.5-pro' },
  ];

  const languageOptions = [
    { value: 'ko', label: '한국어', flag: '🇰🇷' },
    { value: 'en', label: 'English', flag: '🇺🇸' },
  ];

  // Load API keys on mount
  useEffect(() => {
    loadApiKeys();
    loadQueryMetrics();
  }, []);

  const loadQueryMetrics = async () => {
    try {
      setMetricsLoading(true);
      const metrics = await api.getQueryMetrics();
      setQueryMetrics(metrics);
    } catch (err) {
      console.error('Failed to load query metrics:', err);
      setQueryMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  };

  const loadApiKeys = async () => {
    try {
      setLoading(true);
      const keys = await api.getApiKeys();
      setApiKeys(keys);

      // Find current LLM provider from keys or use default
      const llmKey = keys.find(k => ['groq', 'anthropic', 'openai', 'google'].includes(k.provider));
      if (llmKey && llmKey.is_set) {
        setLlmProvider(llmKey.provider);
      }
    } catch (err) {
      console.error('Failed to load API keys:', err);
      showSaveMessage('API 키 로드 실패', false);
    } finally {
      setLoading(false);
    }
  };

  const handleLlmProviderChange = async (value: string) => {
    const selectedOption = llmOptions.find(opt => opt.value === value);
    if (!selectedOption) return;

    try {
      setProviderSaving(true);
      await api.updateApiKeys({}, {
        llm_provider: value,
        llm_model: selectedOption.model
      });
      setLlmProvider(value);
      showSaveMessage('LLM 제공자 설정 저장됨');
    } catch (err) {
      console.error('Failed to update LLM provider:', err);
      showSaveMessage('LLM 제공자 저장 실패', false);
    } finally {
      setProviderSaving(false);
    }
  };

  const handleEditKey = (provider: string) => {
    const key = apiKeys.find(k => k.provider === provider);
    setEditingKey(provider);
    setKeyInput('');
    setShowKey(false);
    setValidationResult(null);
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setKeyInput('');
    setShowKey(false);
    setValidationResult(null);
  };

  const handleValidateKey = async (provider: string) => {
    if (!keyInput.trim()) {
      setValidationResult({ valid: false, message: 'API 키를 입력하세요' });
      return;
    }

    try {
      setValidating(true);
      const result = await api.validateApiKey(provider, keyInput);
      setValidationResult(result);
    } catch (err) {
      setValidationResult({ valid: false, message: '검증 실패' });
    } finally {
      setValidating(false);
    }
  };

  const handleSaveKey = async (provider: string) => {
    if (!keyInput.trim()) {
      showSaveMessage('API 키를 입력하세요', false);
      return;
    }

    try {
      setSaving(true);
      await api.updateApiKeys({ [provider]: keyInput });
      await loadApiKeys(); // Reload to get updated masked key
      setEditingKey(null);
      setKeyInput('');
      setValidationResult(null);
      showSaveMessage('API 키 저장됨');
    } catch (err) {
      console.error('Failed to save API key:', err);
      showSaveMessage('API 키 저장 실패', false);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async (provider: string) => {
    if (!confirm('정말 이 API 키를 삭제하시겠습니까?')) {
      return;
    }

    try {
      setSaving(true);
      await api.updateApiKeys({ [provider]: '' });
      await loadApiKeys();
      showSaveMessage('API 키 삭제됨');
    } catch (err) {
      console.error('Failed to delete API key:', err);
      showSaveMessage('API 키 삭제 실패', false);
    } finally {
      setSaving(false);
    }
  };

  const showSaveMessage = (message: string, success: boolean = true) => {
    setSaveMessage(message);
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const getLlmProviderKey = () => {
    return apiKeys.find(k => k.provider === llmProvider);
  };

  const getExternalKeys = () => {
    return apiKeys.filter(k => ['semantic_scholar', 'cohere'].includes(k.provider));
  };

  return (
    <div className="min-h-screen bg-paper dark:bg-ink flex flex-col">
      <a href="#main-content" className="skip-link">
        메인 콘텐츠로 건너뛰기
      </a>

      <Header
        breadcrumbs={[{ label: 'Settings' }]}
        rightContent={<ThemeToggle />}
      />

      <main id="main-content" className="flex-1 max-w-3xl mx-auto px-4 py-6 sm:py-8 w-full">
        <ErrorBoundary>
          {/* Page Header */}
          <div className="mb-8">
            <span className="text-accent-teal font-mono text-sm tracking-widest uppercase">Configuration</span>
            <h1 className="font-display text-3xl md:text-4xl text-ink dark:text-paper mt-2">Settings</h1>
          </div>

          {/* Save Message Toast */}
          {saveMessage && (
            <div className="mb-4 border-l-2 border-accent-teal bg-accent-teal/10 p-3 flex items-center gap-2">
              <Check className="w-5 h-5 text-accent-teal" />
              <span className="font-mono text-sm text-accent-teal">{saveMessage}</span>
            </div>
          )}

          <div className="space-y-6">
            {/* Theme Settings */}
            <section className="border border-ink/10 dark:border-paper/10 p-5 sm:p-6">
              <h3 className="font-mono text-sm uppercase tracking-wider text-ink dark:text-paper mb-4 flex items-center gap-2">
                <Sun className="w-5 h-5 text-accent-amber" />
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
                        p-4 border-2 text-left transition-all touch-target
                        ${isSelected
                          ? 'border-accent-teal bg-accent-teal/5'
                          : 'border-ink/10 dark:border-paper/10 hover:border-accent-teal/50'
                        }
                      `}
                      aria-pressed={isSelected}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Icon className={`w-5 h-5 ${isSelected ? 'text-accent-teal' : 'text-muted'}`} />
                        <span className={`font-medium ${isSelected ? 'text-accent-teal' : 'text-ink dark:text-paper'}`}>
                          {option.label}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-muted">
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* AI Model Settings */}
            <section className="border border-ink/10 dark:border-paper/10 p-5 sm:p-6">
              <h3 className="font-mono text-sm uppercase tracking-wider text-ink dark:text-paper mb-4 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-accent-violet" />
                AI 모델 설정
              </h3>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted" />
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {llmOptions.map((option) => {
                      const isSelected = llmProvider === option.value;
                      return (
                        <button
                          key={option.value}
                          onClick={() => handleLlmProviderChange(option.value)}
                          disabled={providerSaving}
                          className={`
                            w-full p-4 border-2 text-left transition-all flex items-center justify-between touch-target
                            ${isSelected
                              ? 'border-accent-teal bg-accent-teal/5'
                              : 'border-ink/10 dark:border-paper/10 hover:border-accent-teal/50'
                            }
                            ${providerSaving ? 'opacity-50 cursor-not-allowed' : ''}
                          `}
                          aria-pressed={isSelected}
                        >
                          <div>
                            <span className={`font-medium ${isSelected ? 'text-accent-teal' : 'text-ink dark:text-paper'}`}>
                              {option.label}
                            </span>
                            <p className="text-xs sm:text-sm text-muted mt-1">
                              {option.description}
                            </p>
                          </div>
                          {isSelected && (
                            <span className="text-accent-teal text-lg">✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* LLM Provider API Key Status */}
                  {llmProvider && (
                    <div className="mt-4 border-l-2 border-accent-teal bg-surface/5 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-mono text-sm text-ink dark:text-paper">
                          {llmOptions.find(o => o.value === llmProvider)?.label} API 키
                        </span>
                        {getLlmProviderKey()?.is_set ? (
                          <span className="px-2 py-1 bg-accent-teal/10 text-accent-teal font-mono text-xs">
                            설정됨
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-surface/10 text-muted font-mono text-xs">
                            미설정
                          </span>
                        )}
                      </div>

                      {editingKey === llmProvider ? (
                        <div className="space-y-3">
                          <div className="relative">
                            <input
                              type={showKey ? 'text' : 'password'}
                              value={keyInput}
                              onChange={(e) => setKeyInput(e.target.value)}
                              placeholder="API 키를 입력하세요"
                              className="w-full px-3 py-2 pr-10 bg-paper dark:bg-ink border border-ink/10 dark:border-paper/10 font-mono text-sm focus:outline-none focus:border-accent-teal"
                            />
                            <button
                              onClick={() => setShowKey(!showKey)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-accent-teal"
                            >
                              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>

                          {validationResult && (
                            <div className={`flex items-center gap-2 text-sm font-mono ${validationResult.valid ? 'text-accent-teal' : 'text-accent-red'}`}>
                              {validationResult.valid ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                              {validationResult.message}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleValidateKey(llmProvider)}
                              disabled={validating || !keyInput.trim()}
                              className="px-3 py-2 bg-surface/10 hover:bg-surface/20 text-ink dark:text-paper font-mono text-sm disabled:opacity-50 flex items-center gap-2"
                            >
                              {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                              검증
                            </button>
                            <button
                              onClick={() => handleSaveKey(llmProvider)}
                              disabled={saving || !keyInput.trim()}
                              className="flex-1 px-3 py-2 bg-accent-teal/10 hover:bg-accent-teal/20 text-accent-teal font-mono text-sm uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              저장
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-3 py-2 bg-surface/10 hover:bg-surface/20 text-ink dark:text-paper font-mono text-sm"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          {getLlmProviderKey()?.is_set ? (
                            <span className="text-sm font-mono text-muted">
                              {getLlmProviderKey()?.masked_key}
                            </span>
                          ) : (
                            <span className="text-sm font-mono text-muted">
                              API 키가 설정되지 않았습니다
                            </span>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditKey(llmProvider)}
                              className="px-3 py-1.5 bg-surface/10 hover:bg-surface/20 text-ink dark:text-paper font-mono text-sm"
                            >
                              {getLlmProviderKey()?.is_set ? '수정' : '설정'}
                            </button>
                            {getLlmProviderKey()?.is_set && (
                              <button
                                onClick={() => handleDeleteKey(llmProvider)}
                                className="px-3 py-1.5 bg-accent-red/10 hover:bg-accent-red/20 text-accent-red font-mono text-sm"
                              >
                                삭제
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="mt-4 text-xs sm:text-sm font-mono text-muted">
                    선택한 AI 모델은 채팅 및 엔티티 추출에 사용됩니다.
                  </p>
                </>
              )}
            </section>

            {/* External API Keys */}
            <section className="border border-ink/10 dark:border-paper/10 p-5 sm:p-6">
              <h3 className="font-mono text-sm uppercase tracking-wider text-ink dark:text-paper mb-4 flex items-center gap-2">
                <Key className="w-5 h-5 text-accent-amber" />
                외부 API 키
              </h3>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted" />
                </div>
              ) : (
                <div className="space-y-4">
                  {getExternalKeys().map((keyData) => (
                    <div key={keyData.provider} className="border-l-2 border-accent-teal bg-surface/5 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="text-sm font-mono text-ink dark:text-paper">
                            {keyData.display_name}
                          </span>
                          <p className="text-xs text-muted mt-1 font-mono">
                            {keyData.usage}
                          </p>
                        </div>
                        {keyData.is_set ? (
                          <span className="px-2 py-1 bg-accent-teal/10 text-accent-teal font-mono text-xs">
                            설정됨
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-surface/10 text-muted font-mono text-xs">
                            미설정
                          </span>
                        )}
                      </div>

                      {editingKey === keyData.provider ? (
                        <div className="space-y-3">
                          <div className="relative">
                            <input
                              type={showKey ? 'text' : 'password'}
                              value={keyInput}
                              onChange={(e) => setKeyInput(e.target.value)}
                              placeholder="API 키를 입력하세요"
                              className="w-full px-3 py-2 pr-10 bg-paper dark:bg-ink border border-ink/10 dark:border-paper/10 font-mono text-sm focus:outline-none focus:border-accent-teal"
                            />
                            <button
                              onClick={() => setShowKey(!showKey)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-accent-teal"
                            >
                              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>

                          {validationResult && (
                            <div className={`flex items-center gap-2 text-sm font-mono ${validationResult.valid ? 'text-accent-teal' : 'text-accent-red'}`}>
                              {validationResult.valid ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                              {validationResult.message}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleValidateKey(keyData.provider)}
                              disabled={validating || !keyInput.trim()}
                              className="px-3 py-2 bg-surface/10 hover:bg-surface/20 text-ink dark:text-paper font-mono text-sm disabled:opacity-50 flex items-center gap-2"
                            >
                              {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                              검증
                            </button>
                            <button
                              onClick={() => handleSaveKey(keyData.provider)}
                              disabled={saving || !keyInput.trim()}
                              className="flex-1 px-3 py-2 bg-accent-teal/10 hover:bg-accent-teal/20 text-accent-teal font-mono text-sm uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              저장
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-3 py-2 bg-surface/10 hover:bg-surface/20 text-ink dark:text-paper font-mono text-sm"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          {keyData.is_set ? (
                            <span className="text-sm font-mono text-muted">
                              {keyData.masked_key}
                            </span>
                          ) : (
                            <span className="text-sm font-mono text-muted">
                              미설정
                            </span>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditKey(keyData.provider)}
                              className="px-3 py-1.5 bg-surface/10 hover:bg-surface/20 text-ink dark:text-paper font-mono text-sm"
                            >
                              {keyData.is_set ? '수정' : '설정'}
                            </button>
                            {keyData.is_set && (
                              <button
                                onClick={() => handleDeleteKey(keyData.provider)}
                                className="px-3 py-1.5 bg-accent-red/10 hover:bg-accent-red/20 text-accent-red font-mono text-sm"
                              >
                                삭제
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {getExternalKeys().length === 0 && (
                    <p className="text-sm font-mono text-muted text-center py-4">
                      설정 가능한 외부 API 키가 없습니다
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* Language Settings */}
            <section className="border border-ink/10 dark:border-paper/10 p-5 sm:p-6">
              <h3 className="font-mono text-sm uppercase tracking-wider text-ink dark:text-paper mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-accent-teal" />
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
                        flex-1 p-4 border-2 text-center transition-all touch-target
                        ${isSelected
                          ? 'border-accent-teal bg-accent-teal/5'
                          : 'border-ink/10 dark:border-paper/10 hover:border-accent-teal/50'
                        }
                      `}
                      aria-pressed={isSelected}
                    >
                      <span className="text-2xl mb-2 block">{option.flag}</span>
                      <span className={`font-medium ${isSelected ? 'text-accent-teal' : 'text-ink dark:text-paper'}`}>
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Database Info */}
            <section className="border border-ink/10 dark:border-paper/10 p-5 sm:p-6">
              <h3 className="font-mono text-sm uppercase tracking-wider text-ink dark:text-paper mb-4 flex items-center gap-2">
                <Database className="w-5 h-5 text-accent-violet" />
                데이터베이스 정보
              </h3>
              <div className="border-l-2 border-accent-violet bg-surface/5 p-4">
                <div className="space-y-3 text-sm font-mono">
                  <div className="flex justify-between items-center py-2 border-b border-ink/10 dark:border-paper/10">
                    <span className="text-muted">데이터베이스</span>
                    <span className="text-ink dark:text-paper">PostgreSQL + pgvector</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-ink/10 dark:border-paper/10">
                    <span className="text-muted">호스팅</span>
                    <span className="text-ink dark:text-paper">Supabase</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted">벡터 차원</span>
                    <span className="text-ink dark:text-paper">1536</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Query Performance Metrics */}
            <section className="border border-ink/10 dark:border-paper/10 p-5 sm:p-6">
              <h3 className="font-mono text-sm uppercase tracking-wider text-ink dark:text-paper mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-accent-teal" />
                쿼리 성능 메트릭
              </h3>

              {metricsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted" />
                </div>
              ) : !queryMetrics || queryMetrics.total_queries === 0 ? (
                <div className="bg-surface/5 border border-muted/20 p-6 text-center">
                  <p className="font-mono text-sm text-muted">
                    채팅을 시작하면 쿼리 성능 데이터가 수집됩니다
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Overall Stats */}
                  <div className="border-l-2 border-accent-teal bg-surface/5 p-4">
                    <div className="space-y-2 text-sm font-mono">
                      <div className="flex justify-between items-center py-1">
                        <span className="text-muted">전체 쿼리</span>
                        <span className="text-ink dark:text-paper">{queryMetrics.total_queries}회</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-muted">평균 응답시간</span>
                        <span className="text-ink dark:text-paper">{queryMetrics.avg_latency_ms.toFixed(0)}ms</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-muted">P95 응답시간</span>
                        <span className="text-ink dark:text-paper">{queryMetrics.p95_latency_ms.toFixed(0)}ms</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-muted">최대 응답시간</span>
                        <span className="text-ink dark:text-paper">{queryMetrics.max_latency_ms.toFixed(0)}ms</span>
                      </div>
                    </div>
                  </div>

                  {/* Hop Count Performance */}
                  {Object.keys(queryMetrics.by_hop_count).length > 0 && (
                    <div>
                      <h4 className="font-mono text-xs uppercase tracking-wider text-muted mb-3">
                        홉 수별 응답시간
                      </h4>
                      <div className="space-y-2">
                        {Object.entries(queryMetrics.by_hop_count)
                          .sort(([a], [b]) => parseInt(a) - parseInt(b))
                          .map(([hop, metrics]) => {
                            const maxLatency = Math.max(
                              ...Object.values(queryMetrics.by_hop_count).map(m => m.avg_latency_ms)
                            );
                            const percentage = (metrics.avg_latency_ms / maxLatency) * 100;

                            return (
                              <div key={hop} className="space-y-1">
                                <div className="flex justify-between items-center text-xs font-mono">
                                  <span className="text-muted">{hop}-hop ({metrics.count}회)</span>
                                  <span className="text-ink dark:text-paper">{metrics.avg_latency_ms.toFixed(0)}ms</span>
                                </div>
                                <div className="h-2 bg-surface/10 border border-ink/5 dark:border-paper/5">
                                  <div
                                    className="h-full bg-accent-teal"
                                    style={{ width: `${percentage}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* GraphDB Recommendation */}
                  <div className="border-l-2 border-accent-violet bg-surface/5 p-4">
                    <div className="space-y-3">
                      <div className="font-mono text-xs text-muted">
                        GraphDB 추천
                      </div>
                      <div className="font-mono text-sm text-ink dark:text-paper">
                        {queryMetrics.graphdb_recommendation}
                      </div>
                      {queryMetrics.threshold_info && (
                        <div className="space-y-2 mt-3">
                          <div className="flex justify-between items-center text-xs font-mono">
                            <span className="text-muted">3-hop 목표</span>
                            <span className="text-accent-violet">
                              {queryMetrics.threshold_info.three_hop_target_ms}ms
                            </span>
                          </div>
                          {queryMetrics.by_hop_count['3'] && (
                            <div className="h-2 bg-surface/10 border border-ink/5 dark:border-paper/5">
                              <div
                                className={`h-full ${
                                  queryMetrics.by_hop_count['3'].avg_latency_ms <= queryMetrics.threshold_info.three_hop_target_ms
                                    ? 'bg-accent-teal'
                                    : 'bg-accent-amber'
                                }`}
                                style={{
                                  width: `${Math.min(
                                    (queryMetrics.by_hop_count['3'].avg_latency_ms / queryMetrics.threshold_info.three_hop_target_ms) * 100,
                                    100
                                  )}%`,
                                }}
                              />
                            </div>
                          )}
                          <div className="text-xs font-mono text-muted">
                            {queryMetrics.threshold_info.description}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </ErrorBoundary>
      </main>

      <Footer minimal />
    </div>
  );
}

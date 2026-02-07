'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings, Sun, Moon, Monitor, Database, Cpu, Globe, Key, Eye, EyeOff, Check, X, Loader2, AlertCircle } from 'lucide-react';
import { Header, Footer } from '@/components/layout';
import { ThemeToggle, ErrorBoundary } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/lib/api';

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
  }, []);

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      <a href="#main-content" className="skip-link">
        메인 콘텐츠로 건너뛰기
      </a>

      <Header
        breadcrumbs={[{ label: 'Settings' }]}
        rightContent={<ThemeToggle />}
      />

      <main id="main-content" className="flex-1 max-w-3xl mx-auto px-4 py-6 sm:py-8 w-full">
        <ErrorBoundary>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-3">
            <Settings className="w-6 h-6" />
            설정
          </h2>

          {/* Save Message Toast */}
          {saveMessage && (
            <div className="mb-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 flex items-center gap-2">
              <Check className="w-5 h-5" />
              {saveMessage}
            </div>
          )}

          <div className="space-y-6">
            {/* Theme Settings */}
            <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Sun className="w-5 h-5 text-yellow-500" />
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
                        p-4 rounded-lg border-2 text-left transition-all touch-target
                        ${isSelected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                        }
                      `}
                      aria-pressed={isSelected}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <Icon className={`w-5 h-5 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`} />
                        <span className={`font-medium ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
                          {option.label}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        {option.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* AI Model Settings */}
            <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-purple-500" />
                AI 모델 설정
              </h3>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
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
                            w-full p-4 rounded-lg border-2 text-left transition-all flex items-center justify-between touch-target
                            ${isSelected
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                            }
                            ${providerSaving ? 'opacity-50 cursor-not-allowed' : ''}
                          `}
                          aria-pressed={isSelected}
                        >
                          <div>
                            <span className={`font-medium ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
                              {option.label}
                            </span>
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                              {option.description}
                            </p>
                          </div>
                          {isSelected && (
                            <span className="text-blue-600 dark:text-blue-400 text-lg">✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* LLM Provider API Key Status */}
                  {llmProvider && (
                    <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border dark:border-gray-700">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {llmOptions.find(o => o.value === llmProvider)?.label} API 키
                        </span>
                        {getLlmProviderKey()?.is_set ? (
                          <span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            설정됨
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
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
                              className="w-full px-3 py-2 pr-10 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-sm"
                            />
                            <button
                              onClick={() => setShowKey(!showKey)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>

                          {validationResult && (
                            <div className={`flex items-center gap-2 text-sm ${validationResult.valid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {validationResult.valid ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                              {validationResult.message}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleValidateKey(llmProvider)}
                              disabled={validating || !keyInput.trim()}
                              className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 flex items-center gap-2"
                            >
                              {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                              검증
                            </button>
                            <button
                              onClick={() => handleSaveKey(llmProvider)}
                              disabled={saving || !keyInput.trim()}
                              className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              저장
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          {getLlmProviderKey()?.is_set ? (
                            <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                              {getLlmProviderKey()?.masked_key}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              API 키가 설정되지 않았습니다
                            </span>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditKey(llmProvider)}
                              className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                            >
                              {getLlmProviderKey()?.is_set ? '수정' : '설정'}
                            </button>
                            {getLlmProviderKey()?.is_set && (
                              <button
                                onClick={() => handleDeleteKey(llmProvider)}
                                className="px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50"
                              >
                                삭제
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="mt-4 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                    선택한 AI 모델은 채팅 및 엔티티 추출에 사용됩니다.
                  </p>
                </>
              )}
            </section>

            {/* External API Keys */}
            <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Key className="w-5 h-5 text-orange-500" />
                외부 API 키
              </h3>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-4">
                  {getExternalKeys().map((keyData) => (
                    <div key={keyData.provider} className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border dark:border-gray-700">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {keyData.display_name}
                          </span>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {keyData.usage}
                          </p>
                        </div>
                        {keyData.is_set ? (
                          <span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            설정됨
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
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
                              className="w-full px-3 py-2 pr-10 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg text-sm"
                            />
                            <button
                              onClick={() => setShowKey(!showKey)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>

                          {validationResult && (
                            <div className={`flex items-center gap-2 text-sm ${validationResult.valid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {validationResult.valid ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                              {validationResult.message}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleValidateKey(keyData.provider)}
                              disabled={validating || !keyInput.trim()}
                              className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 flex items-center gap-2"
                            >
                              {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                              검증
                            </button>
                            <button
                              onClick={() => handleSaveKey(keyData.provider)}
                              disabled={saving || !keyInput.trim()}
                              className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              저장
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-3 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          {keyData.is_set ? (
                            <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                              {keyData.masked_key}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              미설정
                            </span>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditKey(keyData.provider)}
                              className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                            >
                              {keyData.is_set ? '수정' : '설정'}
                            </button>
                            {keyData.is_set && (
                              <button
                                onClick={() => handleDeleteKey(keyData.provider)}
                                className="px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50"
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
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      설정 가능한 외부 API 키가 없습니다
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* Language Settings */}
            <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-green-500" />
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
                        flex-1 p-4 rounded-lg border-2 text-center transition-all touch-target
                        ${isSelected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                        }
                      `}
                      aria-pressed={isSelected}
                    >
                      <span className="text-2xl mb-2 block">{option.flag}</span>
                      <span className={`font-medium ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Database Info */}
            <section className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-500" />
                데이터베이스 정보
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400">데이터베이스</span>
                  <span className="text-gray-900 dark:text-white font-mono">PostgreSQL + pgvector</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400">호스팅</span>
                  <span className="text-gray-900 dark:text-white font-mono">Supabase</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-500 dark:text-gray-400">벡터 차원</span>
                  <span className="text-gray-900 dark:text-white font-mono">1536</span>
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

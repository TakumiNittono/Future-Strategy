'use client';

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, User } from 'lucide-react';
import { clsx } from 'clsx';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(typeof navigator !== 'undefined' && navigator.platform.includes('Mac'));
  }, []);

  // テキストエリアの高さを自動調整
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  // メッセージが更新されたらスクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);
    setStreamingContent('');

    // テキストエリアの高さをリセット
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          user: 'user-123',
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to send message';
        let errorDetails = '';
        try {
          const errorText = await response.text();
          errorDetails = errorText;
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.error || errorData.message || errorData.details || errorMessage;
            if (errorData.details) {
              errorDetails = typeof errorData.details === 'string' ? errorData.details : JSON.stringify(errorData.details);
            }
          } catch (e) {
            // JSONではない場合はそのまま使用
            errorMessage = errorText || `HTTP ${response.status}: ${response.statusText}`;
          }
        } catch (e) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        
        const fullErrorMessage = errorDetails 
          ? `${errorMessage}\n\n詳細: ${errorDetails}`
          : errorMessage;
        
        console.error('API Error:', {
          status: response.status,
          statusText: response.statusText,
          errorMessage,
          errorDetails,
        });
        
        throw new Error(fullErrorMessage);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let accumulatedContent = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // ストリーミング完了後、メッセージを確実に保存
          if (accumulatedContent.trim()) {
            const assistantMessage: Message = {
              id: Date.now().toString(),
              role: 'assistant',
              content: accumulatedContent.trim(),
            };
            setMessages((prev) => [...prev, assistantMessage]);
          }
          setStreamingContent('');
          setIsLoading(false);
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              if (accumulatedContent.trim()) {
                const assistantMessage: Message = {
                  id: Date.now().toString(),
                  role: 'assistant',
                  content: accumulatedContent.trim(),
                };
                setMessages((prev) => [...prev, assistantMessage]);
              }
              setStreamingContent('');
              setIsLoading(false);
              return;
            }

            try {
              const parsed = JSON.parse(data);
              
              // doneが来たら最終メッセージを保存して終了
              if (parsed.done) {
                // doneが来た時、contentが一緒に来ている場合はそれを使用、そうでなければaccumulatedContentを使用
                const finalContent = parsed.content || accumulatedContent;
                if (finalContent && finalContent.trim()) {
                  const assistantMessage: Message = {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: finalContent.trim(),
                  };
                  setMessages((prev) => [...prev, assistantMessage]);
                }
                setStreamingContent('');
                setIsLoading(false);
                return;
              }
              
              // contentが来たら更新
              // Dify APIのanswerフィールドは累積テキストを返すはずだが、
              // 実際のレスポンスを確認して適切に処理する
              if (parsed.content !== undefined && parsed.content !== null) {
                const newContent = parsed.content;
                // 新しいコンテンツが既存のコンテンツより長い場合、または既存のコンテンツの続きの場合
                if (newContent.length >= accumulatedContent.length || newContent.startsWith(accumulatedContent)) {
                  // 累積テキストとして扱う
                  accumulatedContent = newContent;
                } else {
                  // 差分として扱う（追加）
                  accumulatedContent += newContent;
                }
              }
            } catch (e) {
              // JSONパースエラーは無視
            }
          }
        }
      }

      // 念のため、最後にもメッセージを保存（まだ保存されていない場合）
      if (accumulatedContent.trim()) {
        setMessages((prev) => {
          // 最後のメッセージが同じでない場合のみ追加
          const lastMessage = prev[prev.length - 1];
          if (!lastMessage || lastMessage.role !== 'assistant' || lastMessage.content !== accumulatedContent.trim()) {
            return [...prev, {
              id: Date.now().toString(),
              role: 'assistant' as const,
              content: accumulatedContent.trim(),
            }];
          }
          return prev;
        });
      }
      setIsLoading(false);
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
      setStreamingContent('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter (MacはCmd+Enter) で送信
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
    // 単独のEnterキーは改行として扱う（デフォルト動作）
  };

  return (
    <div className="flex h-screen flex-col bg-gradient-to-b from-[#212121] via-[#2d2d3a] to-[#212121] text-white">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 border-b border-gray-700/50 bg-[#2d2d3a]/80 backdrop-blur-sm px-4 py-4 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-auto flex-shrink-0 transition-opacity hover:opacity-80">
            <Image
              src="/logo.png"
              alt="Company Logo"
              width={360}
              height={80}
              className="h-full w-auto object-contain drop-shadow-lg"
              style={{ width: 'auto', height: '100%' }}
              priority
            />
          </div>
          <div className="h-20 flex items-center border-l border-gray-600/50 pl-4">
            <h1 className="text-xl font-extrabold text-gray-100 tracking-widest uppercase" style={{ fontFamily: 'var(--font-outfit)', letterSpacing: '0.15em' }}>
              NITTONO専用AIツール
            </h1>
          </div>
        </div>
      </header>

      {/* メッセージエリア */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
        <div className="mx-auto max-w-3xl px-4 py-8">
          {messages.length === 0 && !isLoading && (
            <div className="flex h-full min-h-[60vh] items-center justify-center">
              <div className="text-center text-gray-400 animate-fade-in">
                <div className="mb-6 flex justify-center">
                  <div className="relative h-32 w-auto">
                    <Image
                      src="/logo.png"
                      alt="Company Logo"
                      width={320}
                      height={128}
                      className="h-full w-auto object-contain drop-shadow-lg"
                      style={{ width: 'auto', height: '100%' }}
                      priority
                    />
                  </div>
                </div>
                <p className="text-xl font-medium text-gray-300">メッセージを入力して会話を始めましょう</p>
                <p className="mt-2 text-sm text-gray-500">AIアシスタントがお手伝いします</p>
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={message.id}
              className={clsx(
                'mb-6 flex gap-3 animate-fade-in',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {message.role === 'assistant' && (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#10a37f] to-[#0d8f6e] shadow-lg ring-2 ring-[#10a37f]/20">
                  <Bot className="h-5 w-5 text-white" />
                </div>
              )}

              <div
                className={clsx(
                  'max-w-[85%] rounded-2xl px-5 py-3.5 shadow-lg transition-all hover:shadow-xl',
                  message.role === 'user'
                    ? 'bg-gradient-to-br from-[#10a37f] to-[#0d8f6e] text-white'
                    : 'bg-[#444654] text-gray-100 border border-gray-700/50'
                )}
              >
                {message.role === 'user' ? (
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                ) : (
                  <div className="prose prose-invert max-w-none break-words">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="mb-2 ml-4 list-disc">{children}</ul>,
                        ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal">{children}</ol>,
                        li: ({ children }) => <li className="mb-1">{children}</li>,
                      code: ({ children, className }) => {
                        const isInline = !className;
                        return isInline ? (
                          <code className="rounded bg-gray-700/80 px-1.5 py-0.5 text-sm font-mono">{children}</code>
                        ) : (
                          <code className="block rounded-lg bg-gray-700/80 p-3 text-sm font-mono">{children}</code>
                        );
                      },
                      pre: ({ children }) => (
                        <pre className="mb-2 overflow-x-auto rounded-lg bg-gray-700/80 p-3">{children}</pre>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="my-2 border-l-4 border-[#10a37f] pl-4 italic text-gray-300">
                          {children}
                        </blockquote>
                      ),
                      h1: ({ children }) => <h1 className="mb-3 text-2xl font-bold text-white">{children}</h1>,
                      h2: ({ children }) => <h2 className="mb-2 text-xl font-bold text-white">{children}</h2>,
                      h3: ({ children }) => <h3 className="mb-2 text-lg font-bold text-white">{children}</h3>,
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>

              {message.role === 'user' && (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#10a37f] to-[#0d8f6e] shadow-lg ring-2 ring-[#10a37f]/20">
                  <User className="h-5 w-5 text-white" />
                </div>
              )}
            </div>
          ))}

          {/* 解答作成中のメッセージ表示 */}
          {isLoading && (
            <div className="mb-6 flex gap-3 justify-start animate-fade-in">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#10a37f] to-[#0d8f6e] shadow-lg ring-2 ring-[#10a37f]/20 animate-pulse">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div className="max-w-[85%] rounded-2xl bg-[#444654] border border-gray-700/50 px-5 py-3.5 text-gray-100 shadow-lg">
                <p className="text-gray-400 italic">解答を作成中...</p>
              </div>
            </div>
          )}

          {/* エラー表示 */}
          {error && (
            <div className="mb-4 animate-fade-in rounded-xl bg-red-900/30 border border-red-800/50 px-5 py-4 text-red-200 shadow-lg backdrop-blur-sm">
              <p className="font-semibold mb-2">エラーが発生しました</p>
              <p className="text-sm text-red-300 whitespace-pre-wrap break-words">{error}</p>
              {error.includes('DIFY_API_KEY') && (
                <div className="mt-3 pt-3 border-t border-red-800/50">
                  <p className="text-xs text-red-400">
                    💡 ヒント: .env.localファイルにDIFY_API_KEYを設定してください
                  </p>
                </div>
              )}
              {(error.includes('Workflow not published') || error.includes('not published')) && (
                <div className="mt-3 pt-3 border-t border-red-800/50">
                  <p className="text-xs text-red-400 font-semibold mb-1">
                    💡 解決方法:
                  </p>
                  <ol className="text-xs text-red-400 list-decimal list-inside space-y-1">
                    <li>Difyダッシュボードにログイン</li>
                    <li>チャットアプリケーション（またはワークフロー）を開く</li>
                    <li>「公開」または「Publish」ボタンをクリック</li>
                    <li>公開後、再度お試しください</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 入力エリア */}
      <div className="sticky bottom-0 border-t border-gray-700/50 bg-[#2d2d3a]/80 backdrop-blur-sm px-4 py-5 shadow-2xl">
        <div className="mx-auto max-w-3xl">
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative rounded-2xl border border-gray-600/50 bg-[#40414f] shadow-lg transition-all focus-within:border-[#10a37f]/50 focus-within:ring-2 focus-within:ring-[#10a37f]/20">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="メッセージを入力..."
                className="w-full resize-none rounded-2xl bg-transparent px-5 py-4 pr-14 text-white placeholder-gray-400 focus:outline-none focus:ring-0"
                rows={1}
                style={{
                  maxHeight: '200px',
                  minHeight: '52px',
                }}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className={clsx(
                  'absolute bottom-3 right-3 rounded-xl p-2.5 transition-all duration-200 shadow-lg',
                  input.trim() && !isLoading
                    ? 'bg-gradient-to-br from-[#10a37f] to-[#0d8f6e] text-white hover:from-[#0d8f6e] hover:to-[#0a7d5c] hover:scale-105 active:scale-95'
                    : 'bg-gray-600/50 text-gray-500 cursor-not-allowed'
                )}
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </form>
          <p className="mt-3 text-center text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded bg-gray-700/50 px-2 py-0.5 text-xs font-mono">Enter</kbd>
              <span>改行</span>
            </span>
            <span className="mx-2">/</span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded bg-gray-700/50 px-2 py-0.5 text-xs font-mono">
                {isMac ? '⌘' : 'Ctrl'}+Enter
              </kbd>
              <span>送信</span>
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}


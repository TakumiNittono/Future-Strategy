'use client';

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import { Send, Bot, User, LogIn, UserPlus, X, MessageSquare, Plus, Trash2, Menu, ChevronLeft, Paperclip, File, ArrowUp, Mic } from 'lucide-react';
import { clsx } from 'clsx';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export default function ChatInterface() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [isMac, setIsMac] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // localStorageから会話履歴を読み込む
  useEffect(() => {
    const saved = localStorage.getItem('chat-conversations');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConversations(parsed);
      } catch (e) {
        console.error('Failed to load conversations:', e);
      }
    }
  }, []);

  // 会話履歴をlocalStorageに保存
  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem('chat-conversations', JSON.stringify(conversations));
    }
  }, [conversations]);

  // 現在の会話を取得
  const currentConversation = conversations.find(c => c.id === currentConversationId);

  // 新しいチャットを開始
  const startNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setInput('');
    setError(null);
  };

  // 会話を選択
  const selectConversation = (id: string) => {
    const conversation = conversations.find(c => c.id === id);
    if (conversation) {
      setCurrentConversationId(id);
      setMessages(conversation.messages);
      setError(null);
    }
  };

  // 会話を削除
  const deleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentConversationId === id) {
      startNewChat();
    }
  };

  // 会話を更新
  const updateConversation = (id: string, updatedMessages: Message[]) => {
    setConversations(prev => prev.map(conv => {
      if (conv.id === id) {
        // タイトルを最初のユーザーメッセージから生成
        const firstUserMessage = updatedMessages.find(m => m.role === 'user');
        const title = firstUserMessage 
          ? firstUserMessage.content.substring(0, 30) 
          : conv.title;
        return {
          ...conv,
          messages: updatedMessages,
          title,
          updatedAt: Date.now(),
        };
      }
      return conv;
    }));
  };

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

    // 新しい会話の場合は作成
    let conversationId = currentConversationId;
    if (!conversationId) {
      conversationId = Date.now().toString();
      const newConversation: Conversation = {
        id: conversationId,
        title: input.trim().substring(0, 30) || '新しいチャット',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setConversations(prev => [newConversation, ...prev]);
      setCurrentConversationId(conversationId);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => {
      const updated = [...prev, userMessage];
      // 会話履歴を更新
      if (conversationId) {
        updateConversation(conversationId, updated);
      }
      return updated;
    });
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
            setMessages((prev) => {
              const updated = [...prev, assistantMessage];
              // 会話履歴を更新
              if (conversationId) {
                updateConversation(conversationId, updated);
              }
              return updated;
            });
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
                setMessages((prev) => {
                  const updated = [...prev, assistantMessage];
                  // 会話履歴を更新
                  if (conversationId) {
                    updateConversation(conversationId, updated);
                  }
                  return updated;
                });
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
                  setMessages((prev) => {
                    const updated = [...prev, assistantMessage];
                    // 会話履歴を更新
                    if (conversationId) {
                      updateConversation(conversationId, updated);
                    }
                    return updated;
                  });
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
            const updated = [...prev, {
              id: Date.now().toString(),
              role: 'assistant' as const,
              content: accumulatedContent.trim(),
            }];
            // 会話履歴を更新
            if (conversationId) {
              updateConversation(conversationId, updated);
            }
            return updated;
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

  const handleAuthSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    
    // TODO: 認証処理を実装
    console.log('Auth:', { mode: authMode, email, password });
    
    // モーダルを閉じる
    setShowAuthModal(false);
  };

  // ESCキーでモーダルを閉じる
  useEffect(() => {
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAuthModal) {
          setShowAuthModal(false);
        }
        if (showFileMenu) {
          setShowFileMenu(false);
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showAuthModal, showFileMenu]);

  // メニューの外側をクリックしたら閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showFileMenu) {
        const target = e.target as HTMLElement;
        // プラスボタンやメニュー内の要素をクリックした場合は閉じない
        if (!target.closest('[aria-label="ファイルを追加"]') && 
            !target.closest('.absolute.bottom-full')) {
          setShowFileMenu(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFileMenu]);

  return (
    <div className="flex h-screen bg-gradient-to-b from-[#212121] via-[#2d2d3a] to-[#212121] text-white">
      {/* 左側サイドバー - チャット履歴 */}
      {sidebarOpen && (
        <div className="w-64 flex-shrink-0 border-r border-gray-700/50 bg-[#212121] flex flex-col transition-all">
          {/* サイドバーヘッダー */}
          <div className="p-4 border-b border-gray-700/50">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-700/50 transition-colors"
                aria-label="サイドバーを閉じる"
              >
                <ChevronLeft className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <button
              onClick={startNewChat}
              className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-br from-[#10a37f] to-[#0d8f6e] hover:from-[#0d8f6e] hover:to-[#0a7d5c] transition-all text-white font-semibold shadow-lg"
            >
              <Plus className="h-5 w-5" />
              <span>新しいチャット</span>
            </button>
          </div>

        {/* チャット履歴リスト */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent p-2">
          {conversations.length === 0 ? (
            <div className="text-center text-gray-500 text-sm mt-8 px-4">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>チャット履歴がありません</p>
              <p className="text-xs mt-1">新しいチャットを開始してください</p>
            </div>
          ) : (
            <div className="space-y-1">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => selectConversation(conv.id)}
                  className={clsx(
                    'group relative flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-all',
                    currentConversationId === conv.id
                      ? 'bg-[#2d2d3a] border border-[#10a37f]/50'
                      : 'hover:bg-[#2d2d3a]/50'
                  )}
                >
                  <MessageSquare className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">
                      {conv.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(conv.updatedAt).toLocaleDateString('ja-JP', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <button
                    onClick={(e) => deleteConversation(conv.id, e)}
                    className="opacity-0 group-hover:opacity-100 flex-shrink-0 p-1.5 rounded hover:bg-gray-700/50 transition-opacity"
                    aria-label="削除"
                  >
                    <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* サイドバーフッター */}
        <div className="p-4 border-t border-gray-700/50">
          <button
            onClick={() => setShowAuthModal(true)}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 transition-colors text-gray-300"
          >
            <User className="h-5 w-5" />
            <span>ログイン</span>
          </button>
        </div>
      </div>
      )}

      {/* メインコンテンツエリア */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ヘッダー */}
        <header className="sticky top-0 z-10 border-b border-gray-700/50 bg-[#2d2d3a]/80 backdrop-blur-sm px-4 py-5 shadow-lg">
          <div className="flex items-center gap-4">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-700/50 transition-colors"
                aria-label="サイドバーを開く"
              >
                <Menu className="h-5 w-5 text-gray-300" />
              </button>
            )}
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
            {/* 選択されたファイルの表示 */}
            {selectedFiles.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {selectedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[#40414f] border border-gray-600/50 text-sm text-gray-200"
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded bg-blue-500/20 flex items-center justify-center">
                      <File className="h-5 w-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-200 font-medium truncate">{file.name}</div>
                      <div className="text-xs text-gray-400">ドキュメント</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
                      }}
                      className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-700/50 hover:bg-gray-600/50 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                      aria-label="ファイルを削除"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative rounded-2xl border border-[#10a37f]/50 bg-[#40414f] shadow-lg transition-all">
              {/* プラスボタンとメニュー */}
              <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
                <button
                  type="button"
                  onClick={() => setShowFileMenu(!showFileMenu)}
                  className="flex items-center justify-center w-6 h-6 text-gray-300 hover:text-white transition-colors"
                  aria-label="ファイルを追加"
                >
                  <Plus className="h-5 w-5" />
                </button>
                
                {/* ファイルメニュー */}
                {showFileMenu && (
                  <div className="absolute bottom-full left-0 mb-2 w-64 rounded-lg bg-[#2d2d3a] border border-gray-700/50 shadow-2xl overflow-hidden animate-fade-in">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowFileMenu(false);
                        // メニューを閉じてからファイル選択ダイアログを開く
                        setTimeout(() => {
                          fileInputRef.current?.click();
                        }, 100);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700/50 transition-colors text-left text-gray-200"
                    >
                      <Paperclip className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      <span className="text-sm">写真とファイルを追加</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 隠しファイル入力 */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.txt"
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) {
                    // ファイル選択時の処理
                    const fileArray = Array.from(files);
                    setSelectedFiles(prev => [...prev, ...fileArray]);
                    console.log('Selected files:', fileArray);
                    // TODO: ファイルをアップロードする処理を実装
                  }
                  // 同じファイルを再度選択できるようにリセット
                  e.target.value = '';
                }}
              />

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="質問してみましょう"
                className="w-full resize-none rounded-2xl bg-transparent px-4 pt-6 pb-4 pl-12 pr-20 text-white placeholder-gray-400 focus:outline-none focus:ring-0"
                rows={1}
                style={{
                  maxHeight: '200px',
                  minHeight: '52px',
                }}
                disabled={isLoading}
              />
              {/* 送信ボタン */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className={clsx(
                    'flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200',
                    input.trim() && !isLoading
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:scale-105 active:scale-95'
                      : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                  )}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
      </div>

      {/* 認証モーダル（グローバル） */}
      {showAuthModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAuthModal(false);
            }
          }}
        >
          <div className="relative w-full max-w-md rounded-2xl bg-[#2d2d3a] border border-gray-700/50 shadow-2xl p-6 animate-fade-in">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 rounded-full p-2 hover:bg-gray-700/50 transition-colors"
              aria-label="閉じる"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>
            
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">
                {authMode === 'login' ? 'ログイン' : '新規登録'}
              </h2>
              <p className="text-gray-400 text-sm">
                {authMode === 'login' 
                  ? 'アカウントにログインしてください' 
                  : '新しいアカウントを作成してください'}
              </p>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  メールアドレス
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  className="w-full rounded-lg border border-gray-600 bg-[#40414f] px-4 py-3 text-white placeholder-gray-400 focus:border-[#10a37f] focus:outline-none focus:ring-2 focus:ring-[#10a37f]/20"
                  placeholder="example@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                  パスワード
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  required
                  minLength={6}
                  className="w-full rounded-lg border border-gray-600 bg-[#40414f] px-4 py-3 text-white placeholder-gray-400 focus:border-[#10a37f] focus:outline-none focus:ring-2 focus:ring-[#10a37f]/20"
                  placeholder="••••••••"
                />
              </div>

              {authMode === 'signup' && (
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                    パスワード（確認）
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    required
                    minLength={6}
                    className="w-full rounded-lg border border-gray-600 bg-[#40414f] px-4 py-3 text-white placeholder-gray-400 focus:border-[#10a37f] focus:outline-none focus:ring-2 focus:ring-[#10a37f]/20"
                    placeholder="••••••••"
                  />
                </div>
              )}

              <button
                type="submit"
                className="w-full rounded-lg bg-gradient-to-br from-[#10a37f] to-[#0d8f6e] px-4 py-3 font-semibold text-white hover:from-[#0d8f6e] hover:to-[#0a7d5c] transition-all shadow-lg"
              >
                {authMode === 'login' ? 'ログイン' : '新規登録'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-700/50">
              <button
                onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                className="w-full text-center text-sm text-gray-400 hover:text-[#10a37f] transition-colors"
              >
                {authMode === 'login' ? (
                  <>
                    アカウントをお持ちでない方は{' '}
                    <span className="font-semibold text-[#10a37f]">新規登録</span>
                  </>
                ) : (
                  <>
                    既にアカウントをお持ちの方は{' '}
                    <span className="font-semibold text-[#10a37f]">ログイン</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


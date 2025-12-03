import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    const { messages, user } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages are required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.DIFY_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'DIFY_API_KEY is not configured' },
        { status: 500 }
      );
    }

    // 最後のユーザーメッセージを取得
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') {
      return NextResponse.json(
        { error: 'Last message must be from user' },
        { status: 400 }
      );
    }

    // チャットフローアプリの場合は /v1/chat-messages エンドポイントを使用
    // チャットフローアプリでは inputs パラメータが必要な場合があります
    const requestBody: {
      query: string;
      inputs?: Record<string, any>;
      response_mode: string;
      user: string;
      conversation_id?: string;
    } = {
      query: lastMessage.content,
      // チャットフローアプリでは inputs パラメータが必要
      // 一般的には query を inputs にも含める
      inputs: {
        query: lastMessage.content,
      },
      response_mode: 'streaming',
      user: user || 'user-123',
    };
    
    // チャットアプリのエンドポイント
    const apiUrl = 'https://api.dify.ai/v1/chat-messages';
    
    console.log('Dify API Request:', {
      url: apiUrl,
      method: 'POST',
      hasApiKey: !!apiKey,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'none',
      body: requestBody,
    });

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorText = '';
      let errorJson = null;
      try {
        errorText = await response.text();
        console.log('Dify API error response (raw):', errorText);
        if (errorText) {
          try {
            errorJson = JSON.parse(errorText);
          } catch (e) {
            // JSONではない場合はそのまま使用
            console.log('Error response is not JSON');
          }
        }
      } catch (e) {
        errorText = `Failed to read error response: ${e instanceof Error ? e.message : String(e)}`;
        console.error('Failed to read error response:', e);
      }
      
      console.error('Dify API error:', {
        status: response.status,
        statusText: response.statusText,
        errorText,
        errorJson,
        headers: Object.fromEntries(response.headers.entries()),
      });
      
      const errorMessage = errorJson?.message || errorJson?.error || errorJson?.detail || errorText || `HTTP ${response.status}: ${response.statusText}`;
      return NextResponse.json(
        { 
          error: 'Failed to fetch from Dify API', 
          message: errorMessage,
          details: errorJson || errorText,
          status: response.status,
          statusText: response.statusText,
        },
        { status: response.status }
      );
    }

    // ストリーミングレスポンスを返す
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              controller.close();
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  
                  // チャットアプリのストリーミング形式に応じて処理
                  if (parsed.event === 'message') {
                    // メッセージイベント - answerフィールドに累積テキストが含まれる
                    const answer = parsed.answer || '';
                    if (answer) {
                      controller.enqueue(
                        new TextEncoder().encode(`data: ${JSON.stringify({ content: answer })}\n\n`)
                      );
                    }
                  } else if (parsed.event === 'message_end') {
                    // メッセージ終了時
                    const finalAnswer = parsed.answer || '';
                    if (finalAnswer) {
                      controller.enqueue(
                        new TextEncoder().encode(`data: ${JSON.stringify({ content: finalAnswer, done: true })}\n\n`)
                      );
                    } else {
                      controller.enqueue(
                        new TextEncoder().encode(`data: ${JSON.stringify({ done: true })}\n\n`)
                      );
                    }
                    controller.close();
                    return;
                  } else if (parsed.event === 'error') {
                    // エラーイベントの場合
                    const errorMsg = parsed.message || parsed.answer || 'Unknown error';
                    controller.enqueue(
                      new TextEncoder().encode(`data: ${JSON.stringify({ error: errorMsg, done: true })}\n\n`)
                    );
                    controller.close();
                    return;
                  }
                } catch (e) {
                  // JSONパースエラーは無視して続行
                  continue;
                }
              }
            }
          }
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


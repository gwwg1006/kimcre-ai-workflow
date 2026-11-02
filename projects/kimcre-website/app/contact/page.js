'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import ContactForm from '@/components/ContactForm';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// Suggested questions for the contact page AI assistant
const SUGGESTED_QUESTIONS = [
  { label: '견적 기준', text: '3D 프린팅 견적은 어떤 기준으로 계산되나요?' },
  { label: 'FDM vs SLA', text: 'FDM 방식과 SLA(레진) 출력의 차이가 무엇인가요?' },
  { label: '소요 기간', text: '시제품을 주문하면 제작기간이 얼마나 걸리나요?' },
  { label: '방문 수령', text: '성남 분당 사무실 위치와 방문 수령 방법을 알려주세요.' }
];

export default function ContactPage() {
  
  // AI Chat States
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `안녕하세요! 김명규크리에이티브의 AI 상담 도우미 **김크리**입니다.
      
3D 프린팅 출력 방식(FDM, SLA), 소재 추천, 가격 견적 기준, 그리고 소요 기간 등 궁금한 점을 물어보시면 실시간으로 답변해 드릴게요! 
편하게 아래 질문을 누르시거나 직접 입력해 보세요.`
    }
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [puterLoaded, setPuterLoaded] = useState(false);
  
  const chatBoxRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Dynamic loading of Puter.js client-side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.puter) {
        setPuterLoaded(true);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://js.puter.com/v2/';
      script.async = true;
      script.onload = () => {
        setPuterLoaded(true);
      };
      script.onerror = () => {
        console.error('Failed to load Puter.js in Contact page');
      };
      document.body.appendChild(script);

      return () => {
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
      };
    }
  }, []);

  // Auto-scroll chat window to bottom
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Clean up any streaming on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Send Message logic
  const handleSendMessage = async (textToSend) => {
    const promptText = textToSend || input;
    if (!promptText.trim() || isStreaming) return;

    const userMsg = { role: 'user', content: promptText };
    const updatedMessages = [...messages, userMsg];

    setMessages(updatedMessages);
    setInput('');
    setIsStreaming(true);

    // AI placeholder bubble
    const aiPlaceholder = { role: 'assistant', content: '' };
    setMessages([...updatedMessages, aiPlaceholder]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let aiText = '';

      if (puterLoaded && window.puter) {
        // Direct keyless browser LLM via Puter.js
        const systemPrompt = `당신은 3D 프린팅 전문 업체 '김명규크리에이티브'의 공식 AI 도우미 '김크리'입니다.
친절하고 전문적이며 자세한 정보로 답변해 주세요.
가격이나 제작 의뢰는 이메일 문의 탭이나 상단의 [무료 견적 받기] 페이지(https://kimcre.shop/quote)를 안내해 주세요.
링크를 출력할 때는 반드시 마크다운 [텍스트](https://kimcre.shop/경로) 형식의 절대경로 주소로 출력해야 합니다.`;
        
        let formattedPrompt = `시스템 지시: ${systemPrompt}\n\n`;
        // Take last 6 messages
        updatedMessages.slice(-6).forEach(msg => {
          formattedPrompt += `${msg.role === 'user' ? '사용자' : 'AI'}: ${msg.content}\n`;
        });
        formattedPrompt += `사용자: ${promptText}\nAI:`;

        const stream = await window.puter.ai.chat(formattedPrompt, {
          model: 'gpt-4o-mini',
          temperature: 0.7,
          stream: true
        });

        for await (const chunk of stream) {
          if (chunk?.text) {
            aiText += chunk.text;
            setMessages(prev => {
              const streamUpdated = [...prev];
              if (streamUpdated.length > 0 && streamUpdated[streamUpdated.length - 1].role === 'assistant') {
                streamUpdated[streamUpdated.length - 1].content = aiText;
              }
              return streamUpdated;
            });
          }
        }
      } else {
        // Fallback to local Serverless matching API
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: updatedMessages,
            systemInstruction: `당신은 '김명규크리에이티브'의 AI 상담원 '김크리'입니다.`,
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error('API status code: ' + response.status);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const textSlice = decoder.decode(value, { stream: true });
          aiText += textSlice;
          setMessages(prev => {
            const streamUpdated = [...prev];
            if (streamUpdated.length > 0 && streamUpdated[streamUpdated.length - 1].role === 'assistant') {
              streamUpdated[streamUpdated.length - 1].content = aiText;
            }
            return streamUpdated;
          });
        }
      }

      setIsStreaming(false);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Chat cancelled');
      } else {
        console.error('AI chat failed:', err);
        setMessages(prev => {
          const streamUpdated = [...prev];
          if (streamUpdated.length > 0 && streamUpdated[streamUpdated.length - 1].role === 'assistant') {
            streamUpdated[streamUpdated.length - 1].content = `죄송합니다. 답변 중 오류가 발생했습니다. (사유: ${err.message})`;
          }
          return streamUpdated;
        });
      }
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Custom Inline Markdown Link Parser
  const parseInlineMarkdown = (lineStr) => {
    const linkParts = lineStr.split(/(\[.*?\]\(.*?\))/g);
    
    return linkParts.map((part, index) => {
      const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
      if (linkMatch) {
        const linkText = linkMatch[1];
        let linkUrl = linkMatch[2];
        
        if (linkUrl.startsWith('/')) {
          linkUrl = `https://kimcre.shop${linkUrl}`;
        }
        
        return (
          <a
            key={index}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2"
          >
            {linkText}
          </a>
        );
      }
      
      const boldTokens = part.split(/(\*\*.*?\*\*)/g);
      return boldTokens.map((tok, tIdx) => {
        if (tok.startsWith('**') && tok.endsWith('**')) {
          return <strong key={tIdx}>{tok.slice(2, -2)}</strong>;
        }
        
        const codeTokens = tok.split(/(`.*?`)/g);
        return codeTokens.map((ctok, cidx) => {
          if (ctok.startsWith('`') && ctok.endsWith('`')) {
            return <code key={cidx} className="rounded-sm bg-muted px-1 font-mono text-[0.85em]">{ctok.slice(1, -1)}</code>;
          }
          return ctok;
        });
      });
    });
  };

  // Render message body line-by-line
  const renderMessageContent = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, idx) => {
      if (line.trim() === '') return <br key={idx} />;
      return <p key={idx} className="mb-1.5 last:mb-0">{parseInlineMarkdown(line)}</p>;
    });
  };

  return (
    <>
      <PageHeader
        kicker="Contact"
        title="문의하기"
        description="간단한 질문은 AI 상담으로 바로, 자세한 상담은 문의 양식이나 카카오톡으로 남겨주세요."
      />
      <section className="container-site grid gap-12 py-12 md:py-16 lg:grid-cols-12">
        <aside className="h-fit space-y-6 rounded-[28px] bg-butter p-6 shadow-[0_20px_40px_-24px_rgb(0_0_0/0.45)] lg:col-span-4 lg:-rotate-1">
          {[
            { label: '이메일', value: 'kimcre3d@gmail.com', href: 'mailto:kimcre3d@gmail.com', note: '24시간 접수, 업무 시간 안에 순차 답변' },
            { label: '카카오톡', value: '1:1 오픈채팅 바로가기', href: 'https://open.kakao.com/o/s7JPhrzg', note: '@김명규크리에이티브' },
            { label: '위치', value: '경기도 성남시 분당구', note: '방문 전 사전 연락 필수 · 무료 주차' },
          ].map((item) => (
            <div key={item.label} className="border-t border-ink/20 pt-4 first:border-t-0 first:pt-0">
              <p className="kicker">{item.label}</p>
              {item.href ? (
                <a
                  href={item.href}
                  className="mt-2 block font-medium underline-offset-4 hover:underline"
                  {...(item.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {item.value}
                </a>
              ) : (
                <p className="mt-2 font-medium">{item.value}</p>
              )}
              <p className="mt-1 text-sm text-ink/70">{item.note}</p>
            </div>
          ))}
          <div className="border-t border-ink/20 pt-4">
            <p className="kicker">영업시간</p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><dt>평일</dt><dd className="font-mono">09:00 – 18:00</dd></div>
              <div className="flex justify-between"><dt>토요일 <span className="text-muted-foreground">(예약제)</span></dt><dd className="font-mono">10:00 – 15:00</dd></div>
              <div className="flex justify-between text-muted-foreground"><dt>일요일·공휴일</dt><dd>휴무</dd></div>
            </dl>
          </div>
        </aside>

        <div className="lg:col-span-8">
          <Tabs defaultValue="ai">
            <TabsList>
              <TabsTrigger value="ai">AI 상담</TabsTrigger>
              <TabsTrigger value="email">문의 양식</TabsTrigger>
            </TabsList>

            <TabsContent value="ai" className="mt-4">
              <div className="overflow-hidden rounded-lg border bg-card">
                <div ref={chatBoxRef} className="h-[420px] space-y-4 overflow-y-auto p-5">
                  {messages.map((msg, index) => {
                    const isUser = msg.role === 'user';
                    const isLastAI = !isUser && index === messages.length - 1 && isStreaming;
                    return (
                      <div key={index} className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
                        <div
                          className={cn(
                            'max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed',
                            isUser ? 'bg-foreground text-background' : 'border bg-background'
                          )}
                        >
                          {renderMessageContent(msg.content)}
                          {isLastAI && msg.content === '' && (
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="size-3.5 animate-spin" /> 답변 작성 중
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2 border-t px-5 py-3">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => handleSendMessage(q.text)}
                      disabled={isStreaming}
                      className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:opacity-50"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 border-t p-3">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isStreaming ? '답변이 끝날 때까지 기다려주세요' : '궁금한 점을 입력하세요'}
                    disabled={isStreaming}
                    className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                  />
                  <Button size="icon" onClick={() => handleSendMessage()} disabled={!input.trim() || isStreaming} aria-label="전송">
                    <ArrowUp />
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">AI 답변은 참고용입니다. 정확한 견적은 견적 요청으로 받아보세요.</p>
            </TabsContent>

            <TabsContent value="email" className="mt-4 rounded-lg border bg-card p-6">
              <ContactForm />
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </>
  );
}

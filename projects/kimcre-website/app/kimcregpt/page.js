'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

// SVG Icons
const HamburgerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="12" x2="20" y2="12"></line>
    <line x1="4" y1="6" x2="20" y2="6"></line>
    <line x1="4" y1="18" x2="20" y2="18"></line>
  </svg>
);

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
);

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
);

const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
  </svg>
);

const SettingsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
);

const HomeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
    <polyline points="9 22 9 12 15 12 15 22"></polyline>
  </svg>
);

// Suggestion Prompts Config
const SUGGESTIONS = [
  {
    icon: '🖨️',
    title: '출력 방식 차이점',
    desc: 'FDM과 SLA 출력의 디테일과 비용 차이는 무엇인가요?',
    prompt: '3D 프린팅 서비스에서 FDM 방식과 SLA(레진) 방식의 장단점, 품질 차이, 그리고 어떤 상황에 각각을 선택해야 하는지 상세히 비교 설명해 주세요.'
  },
  {
    icon: '💰',
    title: '3D 프린팅 견적 산출',
    desc: '의뢰 견적은 어떤 기준으로 결정되나요?',
    prompt: '김명규크리에이티브의 3D 프린팅 서비스에서 견적은 구체적으로 어떤 기준으로 계산되나요? (크기, 소재, 시간, 후가공 등)'
  },
  {
    icon: '🛠️',
    title: '환경별 소재 추천',
    desc: '야외용 파츠나 기계 부품에 적합한 소재는?',
    prompt: '야외 환경이나 실제 하중을 받는 기계 기구용 부품으로 3D 프린팅 의뢰를 하려고 합니다. 고온이나 외부 노출에 잘 견디는 우수한 필라멘트 소재를 추천하고 그 이유를 설명해 주세요.'
  },
  {
    icon: '🏢',
    title: '회사 서비스 소개',
    desc: '김명규크리에이티브의 서비스 범위를 알려주세요.',
    prompt: '김명규크리에이티브가 제공하는 3D 프린팅 시제품 제작, 소량 생산, 맞춤 후가공 및 설계 서비스에 대해 전반적으로 설명해 주세요.'
  }
];

// Lightweight CodeBlock Component with Copy Feature
function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.codeBlockContainer}>
      <div className={styles.codeBlockHeader}>
        <span>{language || 'code'}</span>
        <button type="button" onClick={handleCopy} className={styles.copyCodeBtn}>
          {copied ? '복사됨!' : '복사'}
        </button>
      </div>
      <pre className={styles.codeContent}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function KimcreGPTPage() {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [puterLoaded, setPuterLoaded] = useState(false);

  // Settings state
  const [settings, setSettings] = useState({
    model: 'gpt-4o-mini',
    temperature: 0.7,
    systemInstruction: `당신은 3D 프린팅 서비스 전문 업체 '김명규크리에이티브'의 공식 AI 도우미 '김크리GPT'입니다.
친절하고 스마트하며 신뢰감을 주는 어조로 답변해 주세요.
3D 프린팅 기술(FDM, SLA/DLP 레진, SLS 등), 소재(PLA, ABS, PETG, TPU 등), 설계 모델링 수정, 출력 단가, 시제품 제작부터 소량/대량 양산, 샌딩/도색 등 후가공 전반에 걸쳐 전문 지식을 지니고 있습니다.
사용자가 가격 문의나 의뢰 방법 등을 물어보면 견적 요청 페이지(https://kimcre.shop/quote)나 문의 페이지(https://kimcre.shop/contact)를 적극 안내해 주세요. 모든 링크는 반드시 [텍스트](https://kimcre.shop/경로) 형식의 절대경로 주소로 출력해야 합니다.`
  });

  const chatAreaRef = useRef(null);
  const textareaRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Load Puter.js SDK dynamically (Free keyless LLM API provider)
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
        console.log('Puter.js loaded successfully');
        setPuterLoaded(true);
      };
      script.onerror = () => {
        console.error('Failed to load Puter.js script');
      };
      document.body.appendChild(script);

      return () => {
        if (document.body.contains(script)) {
          document.body.removeChild(script);
        }
      };
    }
  }, []);

  // Load Chats on Mount
  useEffect(() => {
    const savedChats = localStorage.getItem('kimcregpt_chats');
    if (savedChats) {
      try {
        const parsed = JSON.parse(savedChats);
        setChats(parsed);
        if (parsed.length > 0) {
          setActiveChatId(parsed[0].id);
          setMessages(parsed[0].messages);
          setSettings((previousSettings) => ({
            model: parsed[0].model || 'gpt-4o-mini',
            temperature: parsed[0].temperature !== undefined ? parsed[0].temperature : 0.7,
            systemInstruction: parsed[0].systemInstruction || previousSettings.systemInstruction
          }));
        }
      } catch (e) {
        console.error('Error loading chats:', e);
      }
    }
  }, []);

  // Save chats to localStorage on changes
  const saveChatsToStorage = (updatedChats) => {
    localStorage.setItem('kimcregpt_chats', JSON.stringify(updatedChats));
    setChats(updatedChats);
  };

  // Adjust input textarea height based on content length
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  // Scroll to bottom on new messages or streaming
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // Switch Conversation
  const selectChat = (chatId) => {
    const selected = chats.find(c => c.id === chatId);
    if (selected) {
      setActiveChatId(chatId);
      setMessages(selected.messages);
      setSettings({
        model: selected.model || 'gpt-4o-mini',
        temperature: selected.temperature !== undefined ? selected.temperature : 0.7,
        systemInstruction: selected.systemInstruction || settings.systemInstruction
      });
      setInput('');
      if (isStreaming) {
        handleStopGeneration();
      }
      setSidebarOpen(false);
    }
  };

  // Start New Chat
  const startNewChat = () => {
    const newId = `chat_${Date.now()}`;
    const newChat = {
      id: newId,
      title: '새로운 대화',
      messages: [],
      model: settings.model,
      temperature: settings.temperature,
      systemInstruction: settings.systemInstruction,
      timestamp: Date.now()
    };

    const updatedChats = [newChat, ...chats];
    saveChatsToStorage(updatedChats);
    setActiveChatId(newId);
    setMessages([]);
    setInput('');
    if (isStreaming) {
      handleStopGeneration();
    }
    setSidebarOpen(false);
  };

  // Delete Chat
  const deleteChat = (e, chatId) => {
    e.stopPropagation();

    const updatedChats = chats.filter(c => c.id !== chatId);
    saveChatsToStorage(updatedChats);

    if (activeChatId === chatId) {
      if (updatedChats.length > 0) {
        setActiveChatId(updatedChats[0].id);
        setMessages(updatedChats[0].messages);
      } else {
        setActiveChatId(null);
        setMessages([]);
      }
    }
  };

  // Stop Streaming
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsStreaming(false);
  };

  // Send Message
  const handleSendMessage = async (textToSend) => {
    const promptText = textToSend || input;
    if (!promptText.trim() || isStreaming) return;

    let currentChatId = activeChatId;
    let updatedChats = [...chats];

    if (!currentChatId) {
      currentChatId = `chat_${Date.now()}`;
      const newChat = {
        id: currentChatId,
        title: promptText.slice(0, 18) + (promptText.length > 18 ? '...' : ''),
        messages: [],
        model: settings.model,
        temperature: settings.temperature,
        systemInstruction: settings.systemInstruction,
        timestamp: Date.now()
      };
      updatedChats = [newChat, ...chats];
      setActiveChatId(currentChatId);
    }

    const userMsg = { role: 'user', content: promptText };
    const updatedMessages = [...messages, userMsg];
    
    setMessages(updatedMessages);
    setInput('');
    setIsStreaming(true);

    const aiMsgPlaceholder = { role: 'assistant', content: '' };
    setMessages([...updatedMessages, aiMsgPlaceholder]);

    // Setup abort controller for local fallback fetch
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let aiText = '';

      // Primary Flow: Keyless Browser LLM via Puter.js
      if (puterLoaded && window.puter) {
        // Construct standard prompt history wrapper to bypass array limit parsing
        const systemPrompt = settings.systemInstruction;
        let formattedPrompt = `시스템 지침: ${systemPrompt}\n\n`;
        
        // Take last 8 messages for context keeping it short
        const historySlice = updatedMessages.slice(-8);
        historySlice.forEach(msg => {
          formattedPrompt += `${msg.role === 'user' ? '사용자' : 'AI 비서'}: ${msg.content}\n`;
        });
        formattedPrompt += `사용자: ${promptText}\nAI 비서:`;

        const responseStream = await window.puter.ai.chat(formattedPrompt, {
          model: settings.model || 'gpt-4o-mini',
          temperature: settings.temperature,
          stream: true
        });

        // Loop over async iterator stream chunks from Puter
        for await (const part of responseStream) {
          if (part?.text) {
            aiText += part.text;
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
        // Fallback Flow: If Puter is not loaded, hit our local SimSimi matching API
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: updatedMessages,
            model: settings.model,
            temperature: settings.temperature,
            systemInstruction: settings.systemInstruction,
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error('API Error status: ' + response.status);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const textChunk = decoder.decode(value, { stream: true });
          aiText += textChunk;

          setMessages(prev => {
            const streamUpdated = [...prev];
            if (streamUpdated.length > 0 && streamUpdated[streamUpdated.length - 1].role === 'assistant') {
              streamUpdated[streamUpdated.length - 1].content = aiText;
            }
            return streamUpdated;
          });
        }
      }

      // Save complete conversation
      const finalMessages = [...updatedMessages, { role: 'assistant', content: aiText }];
      updatedChats = updatedChats.map(c => {
        if (c.id === currentChatId) {
          const isFirstUserMsg = c.messages.length === 0;
          const finalTitle = isFirstUserMsg 
            ? promptText.slice(0, 18) + (promptText.length > 18 ? '...' : '') 
            : c.title;

          return {
            ...c,
            title: finalTitle,
            messages: finalMessages,
            timestamp: Date.now()
          };
        }
        return c;
      });

      saveChatsToStorage(updatedChats);
      setIsStreaming(false);
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Streaming generation aborted.');
      } else {
        console.error('LLM API error:', error);
        
        // Show user error status in chat bubble
        setMessages(prev => {
          const streamUpdated = [...prev];
          if (streamUpdated.length > 0 && streamUpdated[streamUpdated.length - 1].role === 'assistant') {
            streamUpdated[streamUpdated.length - 1].content = `⚠️ 에러가 발생했습니다. (사유: ${error.message})`;
          }
          return streamUpdated;
        });
      }
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Custom Markdown Parsing Renderer
  const renderMessageContent = (text) => {
    if (!text) return null;

    // Helper to parse inline markdown elements: links, bold, and code blocks
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
              style={{ color: '#818cf8', textDecoration: 'underline', fontWeight: '600' }}
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
              return <code key={cidx}>{ctok.slice(1, -1)}</code>;
            }
            return ctok;
          });
        });
      });
    };

    const parts = text.split(/(```[\s\S]*?```)/g);

    return (
      <div className={styles.markdown}>
        {parts.map((part, index) => {
          if (part.startsWith('```') && part.endsWith('```')) {
            const matches = part.match(/```(\w*)\n([\s\S]*?)```/);
            const language = matches ? matches[1] : 'code';
            const code = matches ? matches[2] : part.slice(3, -3);

            return <CodeBlock key={index} language={language} code={code} />;
          }

          return (
            <div key={index}>
              {part.split('\n').map((line, lIdx) => {
                if (line.trim() === '') return <br key={lIdx} />;

                const inlineFormatted = parseInlineMarkdown(line);
                const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
                const numMatch = line.trim().match(/^(\d+)\.\s(.*)/);

                if (isBullet) {
                  const cleanedText = line.trim().substring(2);
                  return (
                    <ul key={lIdx} style={{ margin: '0.15rem 0' }}>
                      <li>{parseInlineMarkdown(cleanedText)}</li>
                    </ul>
                  );
                }

                if (numMatch) {
                  const itemIndex = numMatch[1];
                  const cleanedText = numMatch[2];
                  return (
                    <ol key={lIdx} style={{ margin: '0.15rem 0' }}>
                      <li value={itemIndex}>{parseInlineMarkdown(cleanedText)}</li>
                    </ol>
                  );
                }

                return <p key={lIdx}>{inlineFormatted}</p>;
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const handleSaveSettings = (updatedSettings) => {
    setSettings(updatedSettings);
    
    if (activeChatId) {
      const updatedChats = chats.map(c => {
        if (c.id === activeChatId) {
          return {
            ...c,
            model: updatedSettings.model,
            temperature: updatedSettings.temperature,
            systemInstruction: updatedSettings.systemInstruction
          };
        }
        return c;
      });
      saveChatsToStorage(updatedChats);
    }
    setSettingsOpen(false);
  };

  return (
    <div className={styles.wrapper}>
      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.brand}>
            <span>김명규크리에이티브</span>
            <span className={styles.brandAccent}>GPT</span>
          </div>
          <button onClick={startNewChat} className={styles.newChatBtn}>
            + 새 대화 시작
          </button>
        </div>

        <div className={styles.chatList}>
          {chats.map((c) => (
            <div
              key={c.id}
              onClick={() => selectChat(c.id)}
              className={`${styles.chatItem} ${activeChatId === c.id ? styles.chatItemActive : ''}`}
            >
              <span className={styles.chatTitleText}>{c.title}</span>
              <button
                onClick={(e) => deleteChat(e, c.id)}
                className={styles.deleteChatBtn}
                title="대화 삭제"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
          {chats.length === 0 && (
            <div style={{ color: '#475569', fontSize: '0.8rem', padding: '1rem', textAlign: 'center' }}>
              대화 내역이 없습니다.
            </div>
          )}
        </div>

        <div className={styles.sidebarFooter}>
          <button onClick={() => setSettingsOpen(true)} className={styles.footerBtn}>
            <SettingsIcon /> 설정
          </button>
          <Link href="/" className={styles.footerBtn}>
            <HomeIcon /> 메인 사이트로 돌아가기
          </Link>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 90
          }}
        />
      )}

      {/* Main Panel */}
      <main className={styles.main}>
        <header className={styles.mainHeader}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className={styles.menuToggle}>
              <HamburgerIcon />
            </button>
            <span className={styles.activeTitle}>
              {chats.find(c => c.id === activeChatId)?.title || '새 대화'}
            </span>
          </div>
          <div className={styles.headerActions}>
            <button onClick={startNewChat} className={styles.headerIconBtn} title="새 대화 시작">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            <button onClick={() => setSettingsOpen(true)} className={styles.headerIconBtn} title="대화 설정">
              <SettingsIcon />
            </button>
          </div>
        </header>

        {/* Message Feed Area */}
        <div className={styles.chatArea} ref={chatAreaRef}>
          {messages.length === 0 ? (
            <div className={styles.welcomeContainer}>
              <div className={styles.welcomeLogo}>🤖</div>
              <h1 className={styles.welcomeTitle}>무엇을 도와드릴까요?</h1>
              <p className={styles.welcomeSubtitle}>
                3D 프린팅 시제품 의뢰, 소재 추천, 견적 기준 등 궁금한 내용을 <br />
                김명규크리에이티브의 AI 비서 김크리GPT에게 물어보세요!
              </p>

              <div className={styles.suggestionGrid}>
                {SUGGESTIONS.map((s) => (
                  <div
                    key={s.title}
                    onClick={() => handleSendMessage(s.prompt)}
                    className={styles.suggestionCard}
                  >
                    <span className={styles.suggestionIcon}>{s.icon}</span>
                    <span className={styles.suggestionTitle}>{s.title}</span>
                    <span className={styles.suggestionDesc}>{s.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              const isLastAI = !isUser && index === messages.length - 1 && isStreaming;

              return (
                <div
                  key={index}
                  className={`${styles.messageRow} ${isUser ? styles.messageRowUser : styles.messageRowAI}`}
                >
                  <div
                    className={`${styles.messageBubble} ${isUser ? styles.userBubble : styles.aiBubble}`}
                  >
                    {renderMessageContent(msg.content)}
                    {isLastAI && msg.content === '' && (
                      <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>생각하는 중...</span>
                    )}
                    {isLastAI && <span className={styles.cursor} />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Floating Input Box */}
        <div className={styles.inputContainer}>
          <div className={styles.inputWrapper}>
            <textarea
              ref={textareaRef}
              rows="1"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="여기에 메시지를 입력하세요..."
              className={styles.textarea}
              disabled={isStreaming && messages.length > 0 && messages[messages.length - 1].content === ''}
            />
            {isStreaming ? (
              <button onClick={handleStopGeneration} className={styles.stopBtn} title="생성 중단">
                <StopIcon />
              </button>
            ) : (
              <button
                onClick={() => handleSendMessage()}
                disabled={!input.trim()}
                className={styles.sendBtn}
                title="보내기"
              >
                <SendIcon />
              </button>
            )}
          </div>
          <div className={styles.disclaimer}>
            김크리GPT는 실수를 할 수 있습니다. 중요한 설계 및 견적 계약 정보는 최종 검토해 주세요.
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsModal
          initialSettings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
        />
      )}
    </div>
  );
}

// Modal Inner Component
function SettingsModal({ initialSettings, onClose, onSave }) {
  const [model, setModel] = useState(initialSettings.model);
  const [temperature, setTemperature] = useState(initialSettings.temperature);
  const [systemInstruction, setSystemInstruction] = useState(initialSettings.systemInstruction);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ model, temperature, systemInstruction });
  };

  return (
    <div className={styles.overlay}>
      <form onSubmit={handleSubmit} className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>대화 설정</h2>
          <button type="button" onClick={onClose} className={styles.closeBtn}>
            <CloseIcon />
          </button>
        </div>

        <div className={styles.settingGroup}>
          <label className={styles.settingLabel}>AI 모델 (Puter.js 무료 제공)</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={styles.settingSelect}
          >
            <option value="gpt-4o-mini">GPT 4o Mini (추천)</option>
            <option value="gpt-4o">GPT 4o</option>
            <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
            <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
          </select>
        </div>

        <div className={styles.settingGroup}>
          <label className={styles.settingLabel}>
            <span>창의성 (Temperature)</span>
            <span className={styles.settingValue}>{temperature}</span>
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className={styles.slider}
          />
        </div>

        <button type="submit" className={styles.saveSettingsBtn}>
          설정 저장 및 적용
        </button>
      </form>
    </div>
  );
}

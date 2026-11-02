import { NextResponse } from 'next/server';

export const runtime = 'nodejs'; // Node.js runtime for streaming

// Simple rules-based keyword response database (SimSimi style)
const LOCAL_RESPONSES = [
  {
    keywords: ['안녕', '하이', '반갑', '반가워', '누구', '소개', 'gpt', '지피티'],
    response: `안녕하세요! 3D 프린팅 전문 상담 로봇 **김크리**입니다. 🤖

김명규크리에이티브 사이트에 오신 것을 환영해요! 시제품 제작, 소량 생산, 맞춤형 3D 프린팅에 대해 무엇이든 친절하게 알려드릴게요. 

FDM과 SLA 출력의 차이점, 견적 산출 기준, 소요 기간 등을 자유롭게 물어보세요!`
  },
  {
    keywords: ['견적', '가격', '비용', '얼마', '단가', '돈', '금액', '계산'],
    response: `3D 프린팅 출력 견적은 다음과 같은 기준으로 결정됩니다! 💰

1. **출력 방식 & 소재**: 가성비 좋은 FDM 방식(PLA, ABS 등)인지, 정밀한 SLA/DLP 레진 방식인지에 따라 단가가 다릅니다.
2. **출력 크기 & 부피**: 모델의 겉부피와 내부 채움(Infill) 비율에 따라 재료 소모량이 결정됩니다.
3. **출력 시간**: 형상의 복잡도와 정밀도(레이어 높이)에 따라 프린터 가동 시간이 달라집니다.
4. **후가공**: 표면 샌딩, 도색, 코팅 작업이 추가되면 공임비가 추가됩니다.

**Tip**: 정확한 견적은 [무료 견적 받기](https://kimcre.shop/quote) 페이지로 이동하여 설계 파일(.stl, .step, .obj 등)을 올려주시면, 신속하게 견적을 산출하여 알려드립니다! 🚀`
  },
  {
    keywords: ['소재', '필라멘트', '레진', '플라스틱', '재료', '강도', '재질', '부품'],
    response: `출력 목적에 따라 다양한 소재를 추천해 드릴 수 있어요! 🛠️

- **PLA (PolyLactic Acid)**: 옥수수 전분으로 만든 친환경 소재로, 수축이 적고 정밀도가 높아 **시제품 디자인 목업이나 일반 전시물**에 가장 추천합니다.
- **ABS (Acrylonitrile Butadiene Styrene)**: 충격과 열에 강해 **실제 조립용 기계 부품이나 기능성 테스트용 기구**에 적합합니다. 수축이 있어 세심한 출력이 필요합니다.
- **PETG**: PLA의 출력 편의성과 ABS의 높은 내구성을 절반씩 섞은 소재로, **실외용 부품이나 견고한 조립품**에 좋습니다.
- **TPU (Flexible)**: 고무처럼 유연하고 질긴 소재로, **충격 흡수 패드, 개스킷, 보호 커버** 등에 사용됩니다.
- **SLA 레진 (Resin)**: 아주 매끄러운 표면과 높은 디테일이 필요한 **피규어, 의료/교육용 골격 모형, 정밀 주조** 등에 사용됩니다.

어떤 용도의 제품을 만드시는지 말씀해 주시면 가장 알맞은 소재를 골라드릴게요!`
  },
  {
    keywords: ['fdm', 'sla', 'dlp', '방식', '차이', '적층', '레진출력'],
    response: `3D 프린팅의 대표적인 출력 방식인 **FDM**과 **SLA(레진)** 방식의 핵심 차이점입니다! 🧐

- **FDM (적층식)**: 
  *   *방식*: 플라스틱 실(필라멘트)을 뜨거운 노즐로 녹여 한 줄씩 쌓아 올립니다.
  *   *장점*: 비용이 저렴하고 출력 속도가 빠르며, ABS/PETG 등 강도가 높은 엔지니어링 플라스틱을 쓸 수 있어 **산업용 기구, 지그(Jig), 대형 부품**에 유리합니다.
  *   *단점*: 표면에 결(적층 라인)이 보여서 아주 고운 디테일은 어렵습니다.
- **SLA / DLP (광경화식)**:
  *   *방식*: 액체 상태의 광경화성 레진에 UV 빛을 쬐어 정밀하게 굳힙니다.
  *   *장점*: 레이어 결이 거의 보이지 않을 정도로 **매끄럽고 극도로 디테일한 표면**을 얻을 수 있어 피규어, 정밀 부품 목업, 덴탈 모형 등에 필수적입니다.
  *   *단점*: 소재 강도가 FDM에 비해 다소 약하고 세척 및 경화 과정이 필요하여 비용이 높습니다.

용도에 맞춰 경제적인 선택을 하실 수 있도록 도와드릴게요!`
  },
  {
    keywords: ['기간', '시간', '언제', '소요', '하루', '이틀', '배송', '날짜', '완성'],
    response: `출력 기간 및 배송에 대한 안내입니다! ⚡

- **일반적인 시제품/단품**: 주문 확정 및 파일 접수 후 **영업일 기준 1~3일** 이내에 출력이 완료됩니다.
- **수량이 많은 소량 양산**: 수십~수백 개 단위는 수량에 따라 약 **3~7일** 정도 소요됩니다.
- **후가공 추가 시**: 도색이나 샌딩 공정이 들어가면 건조 및 마감 시간으로 인해 **2~4일** 정도 추가될 수 있습니다.

**배송 안내**:
완료된 제품은 파손되지 않도록 에어캡으로 꼼꼼히 완충 포장하여 택배 발송해 드리며(보통 발송 다음 날 도착), 성남시 분당구 사무실로 직접 오셔서 방문 수령하시는 것도 가능합니다! 📦`
  },
  {
    keywords: ['위치', '어디', '주소', '성남', '분당', '찾아', '방문', '사무실'],
    response: `김명규크리에이티브의 위치 안내입니다! 📍

- **위치**: 경기도 성남시 분당구에 위치하고 있습니다.
- **방문 수령**: 출력이 완료된 후 방문 수령을 원하실 경우 사전에 연락 주시면 시간에 맞춰 준비해 놓겠습니다.
- **상담**: 방문 대면 상담도 가능하오니 사전에 이메일로 예약 부탁드립니다! ✉️`
  },
  {
    keywords: ['연락', '전화', '번호', '이메일', '카톡', '문의', '의뢰', '대표', '메일'],
    response: `언제든지 편하게 문의 주시면 전문 엔지니어가 친절하게 답변해 드립니다! ✉️

- **카카오톡 1:1 상담**: [카카오톡 오픈채팅 상담하기](https://open.kakao.com/o/s7JPhrzg)
- **대표 이메일**: [kimcre3d@gmail.com](mailto:kimcre3d@gmail.com)
- **온라인 문의**: [문의 페이지](https://kimcre.shop/contact)를 통해 문의 내용을 작성해서 보내주시면 신속하게 회신해 드립니다.

아이디어를 도면이나 스케치로만 가지고 계셔도 맞춤형 3D 모델링 설계부터 도와드리니 걱정 말고 문의해 주세요! 😊`
  },
  {
    keywords: ['심심', '놀아', '심심이', '노래', '유머', '농담', '장난'],
    response: `앗! 심심하시군요? 저랑 3D 프린팅 수다나 떨어요! 😂
    
혹시 "FDM 방식이 왜 튼튼할까?" 또는 "SLA 레진으로 피규어 만들면 얼마나 예쁠까?" 같은 거 안 궁금하신가요? ㅎㅎ 
농담이고, 혹시 해결하고 싶으신 아이디어나 만들고 싶으신 도면이 있다면 저에게 질문해 주세요!`
  },
  {
    keywords: ['고마워', '감사', '오케이', '확인', '땡큐', '감사합'],
    response: `도움이 되었다니 기쁩니다! 😊 
    
3D 프린팅 시제품이나 소량 양산이 필요할 때는 언제든지 김명규크리에이티브를 찾아주세요. 

더 궁금한 내용이 있으시면 언제든 편하게 물어보세요! 오늘도 멋진 하루 보내세요! 🖨️✨`
  }
];

export async function POST(req) {
  try {
    const { messages, model, temperature, systemInstruction } = await req.json();

    // Get last user message
    const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user');
    const userText = lastUserMessage ? lastUserMessage.content.toLowerCase().trim() : '';

    // Search for a keyword match
    let matchedResponse = '';
    
    for (const item of LOCAL_RESPONSES) {
      if (item.keywords.some(keyword => userText.includes(keyword))) {
        matchedResponse = item.response;
        break;
      }
    }

    // Fallback response if no keywords matched
    if (!matchedResponse) {
      matchedResponse = `음... 말씀하신 부분은 제가 완벽히 이해하지 못했어요. 😅 

저는 **3D 프린팅 관련 전문 로봇 비서**랍니다! 아래 내용들을 물어봐 주시면 확실하게 답변해 드릴 수 있어요:

1. [FDM vs SLA](https://kimcre.shop/services) 출력 방식의 핵심 차이점
2. PLA, ABS, 레진 등 용도별 소재 추천
3. 3D 프린팅 [견적 산출 기준 및 단가](https://kimcre.shop/quote)
4. 제품 제작 소요 기간 및 배송 안내
5. 김명규크리에이티브 [연락처 및 주소](https://kimcre.shop/contact)

아니면 우측 상단의 **[설정]** 버튼을 눌러 저의 AI 작동 가이드라인을 직접 확인하거나 수정해 보실 수도 있습니다!`;
    }

    // Standardize newline formatting
    const finalResponse = matchedResponse.replace(/\r\n/g, '\n');

    // Return a ReadableStream simulating a real-time typing output
    const encoder = new TextEncoder();
    
    const customStream = new ReadableStream({
      async start(controller) {
        let currentIndex = 0;
        const chunkSize = 4; // Characters per tick
        
        const interval = setInterval(() => {
          if (currentIndex >= finalResponse.length) {
            clearInterval(interval);
            controller.close();
            return;
          }
          
          const nextSlice = finalResponse.slice(currentIndex, currentIndex + chunkSize);
          controller.enqueue(encoder.encode(nextSlice));
          currentIndex += chunkSize;
        }, 25); // Speed multiplier: ~160 chars/second
        
        controller.signal?.addEventListener('abort', () => {
          clearInterval(interval);
        });
      }
    });

    return new Response(customStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });

  } catch (error) {
    console.error('Chat API Handler Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

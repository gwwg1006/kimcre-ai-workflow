import { NextResponse } from 'next/server';
import { getMhbUser, updateMhbUser } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const token = request.cookies.get('mhb_game_session')?.value;
    const payload = verifyToken(token);
    
    if (!payload || !payload.username) {
      return NextResponse.json(
        { error: '인증 세션이 만료되었거나 올바르지 않습니다. 다시 로그인해주세요.' },
        { status: 401 }
      );
    }
    
    const { action } = await request.json();
    
    if (!action) {
      return NextResponse.json({ error: '액션이 지정되지 않았습니다.' }, { status: 400 });
    }
    
    const user = await getMhbUser(payload.username);
    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }
    
    // Time-based decay calculation
    const lastAction = new Date(user.lastActionTime).getTime();
    const now = Date.now();
    const elapsedMinutes = Math.floor((now - lastAction) / (60 * 1000));
    
    let satiety = user.satiety !== undefined ? user.satiety : 80;
    let hydration = user.hydration !== undefined ? user.hydration : 80;
    let stress = user.stress !== undefined ? user.stress : 20;
    
    if (elapsedMinutes >= 1) {
      satiety = Math.max(0, satiety - Math.floor(elapsedMinutes / 1.5));
      hydration = Math.max(0, hydration - elapsedMinutes);
      
      if (satiety === 0 || hydration === 0) {
        stress = Math.min(100, stress + elapsedMinutes * 2);
      } else {
        stress = Math.max(0, stress - Math.floor(elapsedMinutes / 2));
      }
    }
    
    const isFainted = satiety <= 0 || hydration <= 0 || stress >= 100;
    
    let expGain = 0;
    let scoreGain = 0;
    let remark = '';
    let actionSuccess = true;
    let newLevel = user.level;
    let currentExp = user.exp;
    let currentScore = user.score;
    
    // Stats tracking
    let feedCount = user.feedCount;
    let waterCount = user.waterCount;
    let playCount = user.playCount;
    let loveCount = user.loveCount;

    if (isFainted && action !== 'heal') {
      return NextResponse.json({
        success: false,
        isFainted: true,
        user: { ...user, satiety, hydration, stress },
        remark: '문형빈이 쓰러졌습니다! 치료하기(Heal) 액션으로 먼저 깨워주세요.'
      });
    }
    
    switch (action) {
      case 'heal':
        if (!isFainted) {
          return NextResponse.json({ error: '문형빈의 상태가 양호합니다. 치료할 필요가 없습니다.' }, { status: 400 });
        }
        satiety = 50;
        hydration = 50;
        stress = 40;
        expGain = 5;
        remark = '문형빈에게 3D프린터 정밀 안전 물약과 영양제를 투여했습니다! 정신을 차렸습니다.';
        break;
        
      case 'feed':
        satiety = Math.min(100, satiety + 30);
        hydration = Math.max(0, hydration - 5);
        stress = Math.max(0, stress - 5);
        expGain = 15;
        feedCount += 1;
        
        const feedRemarks = [
          '3D프린터 필라멘트 꿀맛! 힘이 솟아납니다.',
          '로켓 엔진 노즐 핫도그를 맛있게 먹었습니다!',
          '레진 세척용 알코올... 이 아닌 사이다를 곁들인 보쌈!',
          '따뜻한 국밥 든든하게 먹고 3D프린터를 점검합니다.'
        ];
        remark = feedRemarks[Math.floor(Math.random() * feedRemarks.length)];
        break;
        
      case 'water':
        hydration = Math.min(100, hydration + 35);
        satiety = Math.max(0, satiety - 2);
        stress = Math.max(0, stress - 2);
        expGain = 10;
        waterCount += 1;
        
        const waterRemarks = [
          '노즐 냉각수 맛이 아주 깔끔하군요!',
          '시원한 아이스 아메리카노 수분 충전 완료!',
          '코딩 중에 마시는 시원한 생수는 꿀맛입니다.'
        ];
        remark = waterRemarks[Math.floor(Math.random() * waterRemarks.length)];
        break;
        
      case 'code':
        satiety = Math.max(0, satiety - 20);
        hydration = Math.max(0, hydration - 20);
        playCount += 1;
        
        const rand = Math.random();
        if (rand < 0.15) {
          // Critical Coding
          stress = Math.min(100, stress + 15);
          expGain = 80;
          remark = '🔥 [크리티컬 코딩!] 3D 모델 슬라이싱 초고속 알고리즘 개발 성공! EXP 대폭 상승!';
        } else if (rand < 0.25) {
          // Failure / Bug
          stress = Math.min(100, stress + 45);
          expGain = 0;
          actionSuccess = false;
          remark = '⚠️ [버그 발생!] 컴파일 에러가 150개 쏟아졌습니다! 문형빈이 폭주하고 스트레스가 폭증합니다!';
        } else {
          // Normal Code
          stress = Math.min(100, stress + 25);
          expGain = 35;
          remark = 'Bambu Lab H2S 출력 공정 최적화 소스 코드를 성공적으로 빌드했습니다.';
        }
        break;
        
      case 'praise':
        stress = Math.max(0, stress - 30);
        satiety = Math.max(0, satiety - 5);
        expGain = 5;
        loveCount += 1;
        
        const praiseRemarks = [
          '칭찬을 받으니 기분이 너무 좋아서 출력 베드를 닦습니다.',
          '감사합니다 대표님! 내일 출근도 기쁘게 하겠습니다!',
          '격려를 받고 코딩 자신감이 충만해졌습니다!'
        ];
        remark = praiseRemarks[Math.floor(Math.random() * praiseRemarks.length)];
        break;
        
      case 'sleep':
        stress = Math.max(0, stress - 50);
        satiety = Math.max(0, satiety - 15);
        hydration = Math.max(0, hydration - 15);
        expGain = 5;
        
        const sleepRemarks = [
          '쿨쿨... Zzz... 3D프린터 출력 완수하는 꿈을 꿉니다...',
          'Bambu Lab 모터 소리를 자장가 삼아 푹 잤습니다. 상쾌합니다!'
        ];
        remark = sleepRemarks[Math.floor(Math.random() * sleepRemarks.length)];
        break;
        
      default:
        return NextResponse.json({ error: '알 수 없는 액션입니다.' }, { status: 400 });
    }
    
    // EXP and Level up calculation
    if (actionSuccess) {
      currentExp += expGain;
      currentScore += expGain * 10;
      
      let expNeeded = newLevel * 100;
      let levelUpOccurred = false;
      
      while (currentExp >= expNeeded) {
        currentExp -= expNeeded;
        newLevel += 1;
        currentScore += newLevel * 1000; // Large score bonus on level up
        expNeeded = newLevel * 100;
        levelUpOccurred = true;
      }
      
      if (levelUpOccurred) {
        remark = `🎊 [레벨 업!] 문형빈이 레벨 ${newLevel}(으)로 성장했습니다! ` + remark;
      }
    }
    
    const updated = await updateMhbUser(user.id, {
      level: newLevel,
      exp: currentExp,
      score: currentScore,
      satiety,
      hydration,
      stress,
      feedCount,
      waterCount,
      playCount,
      loveCount,
      lastActionTime: new Date().toISOString()
    });
    
    return NextResponse.json({
      success: true,
      actionSuccess,
      expGain,
      scoreGain: actionSuccess ? expGain * 10 : 0,
      remark,
      user: {
        id: updated.id,
        username: updated.username,
        level: updated.level,
        exp: updated.exp,
        score: updated.score,
        satiety: updated.satiety,
        hydration: updated.hydration,
        stress: updated.stress,
        feedCount: updated.feedCount,
        waterCount: updated.waterCount,
        playCount: updated.playCount,
        loveCount: updated.loveCount,
        lastActionTime: updated.lastActionTime
      }
    });
  } catch (error) {
    console.error('MHB Game Action API error:', error);
    return NextResponse.json(
      { error: '액션을 처리하는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

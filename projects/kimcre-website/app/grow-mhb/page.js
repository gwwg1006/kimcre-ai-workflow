'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './page.module.css';

function calculateDecayedStats(user) {
  const lastAction = new Date(user.lastActionTime || Date.now()).getTime();
  const elapsedMinutes = Math.max(0, (Date.now() - lastAction) / (60 * 1000));
  const satiety = Math.max(0, (user.satiety ?? 80) - Math.floor(elapsedMinutes / 1.5));
  const hydration = Math.max(0, (user.hydration ?? 80) - elapsedMinutes);
  let stress = user.stress ?? 20;
  stress = satiety === 0 || hydration === 0
    ? Math.min(100, stress + Math.floor(elapsedMinutes * 2))
    : Math.max(0, stress - Math.floor(elapsedMinutes / 2));
  return { satiety, hydration, stress };
}

export default function GrowMhbPage() {
  const [user, setUser] = useState(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [remark, setRemark] = useState('어서오세요! 문형빈을 3D 프린팅 마스터로 키워주세요.');
  const [floatingEffects, setFloatingEffects] = useState([]);
  const [gameState, setGameState] = useState('login'); // 'login' or 'game'
  
  // Real-time decay variables
  const [displaySatiety, setDisplaySatiety] = useState(80);
  const [displayHydration, setDisplayHydration] = useState(80);
  const [displayStress, setDisplayStress] = useState(20);
  
  const effectIdRef = useRef(0);
  const decayIntervalRef = useRef(null);

  // Fetch rankings
  const fetchRankings = useCallback(async () => {
    try {
      const res = await fetch('/api/mhb-game/leaderboard');
      const data = await res.json();
      if (data.success) {
        setLeaderboard(data.leaderboard || []);
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
    }
  }, []);

  useEffect(() => {
    const initialRequest = setTimeout(fetchRankings, 0);
    const interval = setInterval(fetchRankings, 15000); // refresh rankings every 15s
    return () => {
      clearTimeout(initialRequest);
      clearInterval(interval);
    };
  }, [fetchRankings]);

  // Real-time front-end decay simulation
  useEffect(() => {
    if (gameState !== 'game' || !user) return;
    
    // Interval for real-time decrement (approx. every 10 seconds we decay values slightly)
    decayIntervalRef.current = setInterval(() => {
      setDisplaySatiety((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 0) {
          setDisplayStress((s) => Math.min(100, s + 2));
        }
        return next;
      });
      setDisplayHydration((prev) => {
        const next = Math.max(0, prev - 1.5);
        if (next === 0) {
          setDisplayStress((s) => Math.min(100, s + 2));
        }
        return next;
      });
      setDisplayStress((prev) => Math.max(0, prev - 0.5));
    }, 10000);
    
    return () => {
      if (decayIntervalRef.current) clearInterval(decayIntervalRef.current);
    };
  }, [gameState, user]);

  // Auth Handler
  const handleAuth = async (e) => {
    e.preventDefault();
    if (!usernameInput.trim() || !passwordInput) {
      setAuthError('닉네임과 비밀번호를 모두 입력해주세요.');
      return;
    }
    
    setLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/mhb-game/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameInput,
          password: passwordInput
        })
      });
      const data = await res.json();
      
      if (!res.ok) {
        setAuthError(data.error || '로그인에 실패했습니다.');
      } else {
        const decayedStats = calculateDecayedStats(data.user);
        setUser(data.user);
        setDisplaySatiety(decayedStats.satiety);
        setDisplayHydration(decayedStats.hydration);
        setDisplayStress(decayedStats.stress);
        setGameState('game');
        setRemark(
          data.isNewUser
            ? `어서오세요, ${data.user.username}님! 새로운 문형빈 펫이 생성되었습니다.`
            : `반갑습니다, ${data.user.username}님! 육성을 재개합니다.`
        );
        fetchRankings();
      }
    } catch (err) {
      setAuthError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // Action Handler
  const handleAction = async (action) => {
    if (actionLoading || !user) return;
    setActionLoading(true);
    
    // Add floating emoji effect
    let emoji = '🎒';
    if (action === 'feed') emoji = '🍔';
    else if (action === 'water') emoji = '🥤';
    else if (action === 'code') emoji = '💻';
    else if (action === 'praise') emoji = '💖';
    else if (action === 'sleep') emoji = '💤';
    else if (action === 'heal') emoji = '🩹';
    
    const newEffect = {
      id: effectIdRef.current++,
      emoji,
      left: Math.random() * 60 + 20 // random X offset
    };
    
    setFloatingEffects((prev) => [...prev, newEffect]);
    setTimeout(() => {
      setFloatingEffects((prev) => prev.filter((eff) => eff.id !== newEffect.id));
    }, 1500);

    try {
      const res = await fetch('/api/mhb-game/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      
      if (data.success) {
        setUser(data.user);
        setDisplaySatiety(data.user.satiety);
        setDisplayHydration(data.user.hydration);
        setDisplayStress(data.user.stress);
        setRemark(data.remark);
        fetchRankings();
      } else if (data.isFainted) {
        setRemark(data.remark);
      } else {
        setRemark(data.error || '액션을 수행할 수 없습니다.');
      }
    } catch (err) {
      setRemark('액션 전송 중 네트워크 에러가 발생했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  // Determine avatar expression state
  const getAvatarState = () => {
    const isFainted = displaySatiety <= 0 || displayHydration <= 0 || displayStress >= 100;
    if (isFainted) return 'fainted';
    if (displayStress > 70) return 'stressed';
    if (displaySatiety < 35) return 'hungry';
    if (displayHydration < 35) return 'thirsty';
    return 'normal';
  };

  const avatarState = getAvatarState();

  const handleLogout = () => {
    // simple logout by clearing react state
    setUser(null);
    setGameState('login');
    setUsernameInput('');
    setPasswordInput('');
  };

  return (
    <main className={styles.gameContainer}>
      <div className={styles.glassBackground}></div>
      
      {gameState === 'login' ? (
        <section className={styles.loginCard}>
          <div className={styles.logoHeader}>
            <span className={styles.logoBadge}>EASTER EGG</span>
            <h1 className={styles.logoTitle}>문형빈 키우기</h1>
            <p className={styles.logoSubtitle}>Moon Hyung-bin Growing Simulator</p>
          </div>
          
          <form onSubmit={handleAuth} className={styles.loginForm}>
            <p className={styles.loginInfo}>
              사용할 닉네임과 비밀번호를 입력해주세요. <br />
              닉네임이 없으면 새롭게 키우기가 시작되고, 기존에 생성된 적이 있다면 비밀번호 확인 후 이어집니다.
            </p>
            
            <div className={styles.inputGroup}>
              <label htmlFor="username">육성사 닉네임</label>
              <input
                id="username"
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="2자~15자 이내"
                maxLength={15}
                required
              />
            </div>
            
            <div className={styles.inputGroup}>
              <label htmlFor="password">비밀번호</label>
              <input
                id="password"
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="데이터 보관용 비밀번호"
                minLength={8}
                maxLength={128}
                required
              />
            </div>
            
            {authError && <div className={styles.errorText}>{authError}</div>}
            
            <button type="submit" disabled={loading} className={styles.loginButton}>
              {loading ? '인증 진행 중...' : '문형빈 입양/성장 이어하기'}
            </button>
          </form>
          
          <div className={styles.leaderboardBox}>
            <h3 className={styles.leaderboardTitle}>🏆 실시간 랭킹 Top 5</h3>
            <ul className={styles.leaderboardListMini}>
              {leaderboard.slice(0, 5).map((player, idx) => (
                <li key={player.id} className={styles.leaderboardItemMini}>
                  <span className={styles.rankBadge}>{idx + 1}등</span>
                  <span className={styles.rankUsername}>{player.username}</span>
                  <span className={styles.rankLevel}>Lv.{player.level}</span>
                  <span className={styles.rankScore}>{player.score.toLocaleString()}점</span>
                </li>
              ))}
              {leaderboard.length === 0 && (
                <li className={styles.emptyRanking}>아직 등록된 랭커가 없습니다. 첫 랭커가 되어보세요!</li>
              )}
            </ul>
          </div>
        </section>
      ) : (
        <section className={styles.gameGrid}>
          {/* Left Panel: Avatar & Controller */}
          <div className={styles.gamePanelLeft}>
            <div className={styles.userBar}>
              <div className={styles.userMeta}>
                <span className={styles.trainerTag}>육성사: {user.username}</span>
                <span className={styles.userLevelBadge}>LV. {user.level}</span>
              </div>
              <button onClick={handleLogout} className={styles.logoutButton}>로그아웃</button>
            </div>
            
            <div className={styles.avatarStage}>
              {/* Floating Emotive Effects */}
              {floatingEffects.map((eff) => (
                <span
                  key={eff.id}
                  className={styles.floatingEffect}
                  style={{ left: `${eff.left}%` }}
                >
                  {eff.emoji}
                </span>
              ))}
              
              {/* Moon Hyung-bin Avatar (HTML/CSS & SVG illustration) */}
              <div className={`${styles.mhbAvatar} ${styles[avatarState]}`}>
                <div className={styles.mhbBody}>
                  {/* Face details */}
                  <div className={styles.mhbEyes}>
                    {avatarState === 'fainted' ? (
                      <>
                        <span className={styles.deadEye}>×</span>
                        <span className={styles.deadEye}>×</span>
                      </>
                    ) : avatarState === 'hungry' ? (
                      <>
                        <span className={styles.hungryEye}>😭</span>
                        <span className={styles.hungryEye}>😭</span>
                      </>
                    ) : avatarState === 'stressed' ? (
                      <>
                        <span className={styles.stressedEye}>🔥</span>
                        <span className={styles.stressedEye}>🔥</span>
                      </>
                    ) : (
                      <>
                        <span className={styles.normalEye}></span>
                        <span className={styles.normalEye}></span>
                      </>
                    )}
                  </div>
                  <div className={styles.mhbMouth}>
                    {avatarState === 'fainted' ? (
                      <span className={styles.deadMouth}>_</span>
                    ) : avatarState === 'stressed' ? (
                      <span className={styles.stressedMouth}>3</span>
                    ) : avatarState === 'hungry' ? (
                      <span className={styles.hungryMouth}>O</span>
                    ) : (
                      <span className={styles.smileMouth}></span>
                    )}
                  </div>
                </div>
                {/* 3D printer frame around him as a mascot */}
                <div className={styles.printerFrame}>
                  <div className={styles.topBeam}></div>
                  <div className={styles.leftPillar}></div>
                  <div className={styles.rightPillar}></div>
                  <div className={styles.extruderNozzle}></div>
                </div>
              </div>
              
              {/* Speech bubble */}
              <div className={styles.speechBubble}>
                <p>{remark}</p>
              </div>
            </div>
            
            {/* Status indicators */}
            <div className={styles.statsPanel}>
              <div className={styles.statRow}>
                <div className={styles.statLabel}>🍔 포만감 ({displaySatiety}/100)</div>
                <div className={styles.progressBarWrap}>
                  <div
                    className={`${styles.progressBar} ${styles.satietyBar}`}
                    style={{ width: `${displaySatiety}%` }}
                  ></div>
                </div>
              </div>
              
              <div className={styles.statRow}>
                <div className={styles.statLabel}>🥤 수분 ({displayHydration}/100)</div>
                <div className={styles.progressBarWrap}>
                  <div
                    className={`${styles.progressBar} ${styles.hydrationBar}`}
                    style={{ width: `${displayHydration}%` }}
                  ></div>
                </div>
              </div>
              
              <div className={styles.statRow}>
                <div className={styles.statLabel}>🔥 스트레스 ({displayStress}/100)</div>
                <div className={styles.progressBarWrap}>
                  <div
                    className={`${styles.progressBar} ${styles.stressBar}`}
                    style={{ width: `${displayStress}%` }}
                  ></div>
                </div>
              </div>
              
              <div className={styles.statRow}>
                <div className={styles.statLabel}>
                  ✨ EXP ({user.exp}/{user.level * 100})
                </div>
                <div className={styles.progressBarWrap}>
                  <div
                    className={`${styles.progressBar} ${styles.expBar}`}
                    style={{ width: `${(user.exp / (user.level * 100)) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
            
            {/* Controller buttons */}
            <div className={styles.controlButtons}>
              {avatarState === 'fainted' ? (
                <button
                  onClick={() => handleAction('heal')}
                  disabled={actionLoading}
                  className={`${styles.actionButton} ${styles.healBtn}`}
                >
                  🩹 영양 물약 투여 (Heal)
                </button>
              ) : (
                <>
                  <button
                    onClick={() => handleAction('feed')}
                    disabled={actionLoading}
                    className={styles.actionButton}
                  >
                    🍔 밥주기 (Feed)
                  </button>
                  <button
                    onClick={() => handleAction('water')}
                    disabled={actionLoading}
                    className={styles.actionButton}
                  >
                    🥤 물주기 (Water)
                  </button>
                  <button
                    onClick={() => handleAction('code')}
                    disabled={actionLoading}
                    className={`${styles.actionButton} ${styles.codeBtn}`}
                  >
                    💻 코딩 시키기 (Code)
                  </button>
                  <button
                    onClick={() => handleAction('praise')}
                    disabled={actionLoading}
                    className={styles.actionButton}
                  >
                    💖 칭찬하기 (Praise)
                  </button>
                  <button
                    onClick={() => handleAction('sleep')}
                    disabled={actionLoading}
                    className={styles.actionButton}
                  >
                    💤 재우기 (Sleep)
                  </button>
                </>
              )}
            </div>
            
            <div className={styles.scoreBoard}>
              🏆 누적 점수: <strong>{user.score.toLocaleString()}점</strong>
            </div>
          </div>
          
          {/* Right Panel: Rankings & Stats */}
          <div className={styles.gamePanelRight}>
            <h2 className={styles.rightPanelTitle}>🥇 3D프린팅 마스터 랭킹</h2>
            <div className={styles.leaderboardTableWrap}>
              <table className={styles.leaderboardTable}>
                <thead>
                  <tr>
                    <th>순위</th>
                    <th>닉네임</th>
                    <th>레벨</th>
                    <th>점수</th>
                    <th>밥/물 주기</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((player, idx) => (
                    <tr
                      key={player.id}
                      className={player.username === user.username ? styles.myRankRow : ''}
                    >
                      <td className={styles.rankCell}>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                      </td>
                      <td className={styles.usernameCell}>{player.username}</td>
                      <td>Lv.{player.level}</td>
                      <td className={styles.scoreCell}>{player.score.toLocaleString()}점</td>
                      <td>{player.feedCount || 0}회 / {player.waterCount || 0}회</td>
                    </tr>
                  ))}
                  {leaderboard.length === 0 && (
                    <tr>
                      <td colSpan="5" className={styles.noRankData}>불러온 랭킹 데이터가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Guide & Rules */}
            <div className={styles.gameGuide}>
              <h3>💡 육성 팁 & 게임 가이드</h3>
              <ul>
                <li><strong>밥주기 & 물주기</strong>: 레벨 성장을 위한 가장 안정적인 EXP 공급원입니다. 단, 포만감이 100을 넘으면 과적 상태로 스트레스가 올라가니 수치를 살피며 먹이세요!</li>
                <li><strong>코딩 시키기</strong>: 성공 시 35 EXP를 얻으며, <strong>15% 확률로 대성공(80 EXP)</strong>을 얻지만 <strong>10%의 버그 에러 발생 시 스트레스가 크게 오르고 EXP를 얻지 못합니다.</strong></li>
                <li><strong>스트레스 100 도달 또는 탈수/굶주림</strong>: 문형빈이 기절 상태(Fainted)에 빠집니다. 기절 시 모든 경험치 보너스 획득이 불가하며 🩹 치료(Heal) 액션을 통해서만 복구됩니다.</li>
                <li>점수는 레벨업 마다 대량의 보너스 점수가 추가되어 반영됩니다.</li>
              </ul>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

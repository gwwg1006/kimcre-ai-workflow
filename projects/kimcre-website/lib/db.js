import { sql } from '@vercel/postgres';
import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import path from 'path';
import { del } from '@vercel/blob';

// If POSTGRES_URL is set, we are running in Vercel with Postgres
const isProductionDB = !!process.env.POSTGRES_URL;

// Default Portfolio items for seeding
// Category migration map for v5 restructuring
const CATEGORY_V5_MAP = {
  '커스텀 이니셜 네임택':                            '커스텀 브랜딩·소품',
  '조립식 아키텍처 외벽 모형':                        '건축·도시 모형',
  '경량 래티스 지지 프레임':                          '구조 부품 & 소량 양산',
  'Bambu Lab 고속 출력 공정':                        '출력 공정·기술 쇼케이스',
  '인체공학적 디바이스 거치대':                        '인테리어·데스크 소품',
  '인체 골격 해부학 교육 모형':                        '의료·교육용 모형',
  '생산 라인 조립용 맞춤 지그(Jig)':                  '산업용 기구·지그',
  '정밀 소량 양산 플레이트 파츠 (100개)':               '구조 부품 & 소량 양산',
  '소형 조인트 패드 및 부싱 세트':                     '구조 부품 & 소량 양산',
  '장비 장착용 브래킷 홀더 패키지':                    '구조 부품 & 소량 양산',
  'FDM 격자 트레이 지지판':                           '출력 공정·기술 쇼케이스',
  '감속기 조립용 기어 세트':                          '산업용 기구·지그',
  '기하학적 입체 디자인 큐브 오브제':                   '커스텀 브랜딩·소품',
  '아파트 세대 평면 스케일 모형':                      '건축·도시 모형',
  'FDM 황색 완충 격자 구조체':                        '출력 공정·기술 쇼케이스',
  '전동 공구 본체 하우징 시제품':                      '제품 디자인 목업',
  '적층형 미니 데스크 수납 트레이':                    '인테리어·데스크 소품',
  '복층 사무용 빌딩 내부 건축 모형':                   '건축·도시 모형',
  '모듈러 주름 패턴 데스크 오거나이저':                 '인테리어·데스크 소품',
  '고정밀 투명 레진 척추 모형':                        '의료·교육용 모형',
  'FDM 유기적 서포트 구조 테스트':                     '출력 공정·기술 쇼케이스',
  '제어 컨트롤러 산업용 키패드 하우징':                 '전자기기·제어기 케이스',
  '커스텀 기계식 키보드 민트 하우징 케이스':             '전자기기·제어기 케이스',
  '3D 프린팅 미니어처 빌리지 하우스 단지 모형':          '건축·도시 모형',
  '대형 유선형 선박 구조물':                           '제품 디자인 목업',
  '그린 아이폰  목업':                               '제품 디자인 목업',
  '그린 아이폰 목업':                                '제품 디자인 목업',
  '고정형 원통 실린더 다중 거치대 프레임 랙':             '산업용 기구·지그',
  'ESP32 모듈 내장형 소형 제어기 외관 하우징 케이스':     '전자기기·제어기 케이스',
  '모듈러 구조용 3D 프린팅 조인트 파이프 커넥터':         '구조 부품 & 소량 양산',
  '기구 제어 및 브라켓 결합용 사각 베이스플레이트 케이스': '전자기기·제어기 케이스',
  '미니어처 블록형 아키텍처 도시 모형':                  '건축·도시 모형',
  '정밀 기계 부품 조립용 팔각형 그레이 플레이트':          '산업용 기구·지그',
  '정밀 인테리어 미니어처 가구 패키지':                  '인테리어·데스크 소품',
  '대형 아키텍처 빌딩 입체 건축 모형':                  '건축·도시 모형',
  '자율주행 로봇 / 드론 바디 캐노피 시제품':             '제품 디자인 목업',
  '다목적 플랜지 마운트 어댑터 소량 양산':               '구조 부품 & 소량 양산',
  '맞춤형 하드웨어 기기 외관 케이스 시제품':             '전자기기·제어기 케이스',
  '마인크래프트 감성 픽셀 무드등':                      '인테리어·데스크 소품',
  '다채로운 커스텀 그래피티 레터링 네임택':               '커스텀 브랜딩·소품',
  'ABS 부품':                                       '구조 부품 & 소량 양산',
  '스마트기기 목업':                                  '제품 디자인 목업',
};

const defaultPortfolios = [
  {
    image: '/images/portfolio-prototype-v3.png',
    title: '로켓 엔진 노즐 정밀 시제품',
    category: '제품 디자인 목업',
    material: 'PETG-CF / ABS',
    duration: '2일',
    description: 'Bambu Lab 3D 프린터와 고강도 엔지니어링 필라멘트를 이용해 출력한 우주 항공용 로켓 엔진 노즐 스케일 시제품입니다. 복잡한 외부 배관과 미세 유로 구조가 이음새 없이 완벽한 정밀도로 인쇄되었습니다.'
  },
  {
    image: '/images/portfolio-figure-v3.png',
    title: '커스텀 이니셜 네임택',
    category: '커스텀 브랜딩·소품',
    material: 'PLA (다색 적층)',
    duration: '1일',
    description: '브랜드 홍보 및 개인 커스터마이징을 위한 입체 이니셜 네임플레이트 세트입니다. 파스텔톤 컬러 필라멘트를 다중 압출 방식으로 인쇄하여 선명한 발색과 귀여운 디자인을 구현했습니다.'
  },
  {
    image: '/images/portfolio-architecture-v3.png',
    title: '조립식 아키텍처 외벽 모형',
    category: '건축·도시 모형',
    material: 'Matte PLA',
    duration: '4일',
    description: '설계 타당성 검토 및 전시 목적으로 조립식 패널화 설계가 도입된 백색 건축 모형입니다. 절곡면의 정밀한 각도 결합과 벽면 마감 완성도를 고려해 무광 화이트 필라멘트로 정밀 출력했습니다.'
  },
  {
    image: '/images/portfolio-industrial-v3.png',
    title: '경량 래티스 지지 프레임',
    category: '구조 부품 & 소량 양산',
    material: 'ABS',
    duration: '3일',
    description: '내부에 입체 격자 구조(Lattice Grid)를 내장해 구조적 강성을 지키면서도 무게와 소재 비용을 절감한 산업용 프레임 부품입니다. 고강도 ABS 소재를 사용하여 조립 테스트가 가능합니다.'
  },
  {
    image: '/images/portfolio-medical-v3.png',
    title: 'Bambu Lab 고속 출력 공정',
    category: '출력 공정·기술 쇼케이스',
    material: 'PLA / PETG',
    duration: '상시',
    description: '고속 정밀 인쇄 및 챔버 온도 유지가 강점인 최신 Bambu Lab 3D 프린터의 가동 장면입니다. 지능형 자동 제어 루프를 사용하여 대형 모델도 열변형 없이 고품질로 양산합니다.'
  },
  {
    image: '/images/portfolio-art-v3.png',
    title: '인체공학적 디바이스 거치대',
    category: '인테리어·데스크 소품',
    material: 'Matte PLA',
    duration: '2일',
    description: '모던한 데스크 환경에 맞춰 인체공학적 곡선미로 디자인된 프리미엄 거치대 생활 소품입니다. 레이어 결이 거의 보이지 않도록 후가공 및 무광 텍스처 인쇄 최적화를 완료했습니다.'
  },
  {
    image: '/images/portfolio-anatomy.jpg',
    title: '인체 골격 해부학 교육 모형',
    category: '의료·교육용 모형',
    material: 'White Resin (SLA)',
    duration: '2일',
    description: '실제 환자의 CT 데이터를 정밀 3D 모델링하여 고정밀 SLA 레진 프린터로 출력한 골반 및 척추 관절 모형입니다. 의료 교육 및 모의 수술 시뮬레이션용으로 뛰어난 미세 디테일과 치수 정확도를 보장합니다.'
  },
  {
    image: '/images/portfolio-jig.jpg',
    title: '생산 라인 조립용 맞춤 지그(Jig)',
    category: '산업용 기구·지그',
    material: 'ABS (Black)',
    duration: '1일',
    description: '제조 공정 내 부품 고정 및 정밀 조립을 보조하기 위해 커스텀 설계된 산업용 지그입니다. 높은 기계적 강도를 견디기 위해 인필 충전율과 구조 설계를 보강하여 제작했습니다.'
  },
  {
    image: '/images/portfolio-mass-production.jpg',
    title: '정밀 소량 양산 플레이트 파츠 (100개)',
    category: '구조 부품 & 소량 양산',
    material: 'PLA / PETG (Black)',
    duration: '3일',
    description: '금형 제작 없이 수일 내에 신속하게 생산하여 실제 현장에 실장한 FDM 판형 플라스틱 기계 부품들입니다. 다량의 부품을 균일한 퀄리티로 대량 양산 및 포장 납품을 완료하였습니다.'
  },
  {
    image: '/images/portfolio-small-parts.jpg',
    title: '소형 조인트 패드 및 부싱 세트',
    category: '구조 부품 & 소량 양산',
    material: 'TPU (Flexible)',
    duration: '2일',
    description: '기계 조인트의 밀폐성과 진동 방지 성능을 테스트하기 위해 연질의 고탄성 TPU 소재로 3D 프린팅한 맞춤형 소형 고무 패드 및 스토퍼 세트입니다.'
  },
  {
    image: '/images/portfolio-holder.jpg',
    title: '장비 장착용 브래킷 홀더 패키지',
    category: '구조 부품 & 소량 양산',
    material: 'PETG',
    duration: '2일',
    description: '기계 하우징 및 외부 배선 마운팅을 위해 고강성 PETG 소재로 설계된 체결용 홀더 세트입니다. 하중 집중 지점을 보강하여 내구성과 실용성을 극대화했습니다.'
  },
  {
    image: '/images/portfolio-tray.jpg',
    title: 'FDM 격자 트레이 지지판',
    category: '출력 공정·기술 쇼케이스',
    material: 'Standard PLA (White)',
    duration: '1일',
    description: '넓은 판상 형태의 인쇄물이 휘어지거나 수축하지 않도록 촘촘한 벌집 격자 형태로 정밀 출력된 트레이 시제품입니다. 격자망의 두께와 균일도를 고속 FDM 노즐로 정확하게 보장했습니다.'
  },
  {
    image: '/images/portfolio-gears.jpg',
    title: '감속기 조립용 기어 세트',
    category: '산업용 기구·지그',
    material: 'Nylon (PA12) / ABS',
    duration: '2일',
    description: '다단 감속기와 기어 결합부의 기계적 실장 테스트를 위해 정교하게 조립 생산된 기어 링크 세트입니다. 마찰 저항이 적고 내구성이 우수한 엔지니어링 나일론을 혼용하여 기계 동작 효율을 검증했습니다.'
  },
  {
    image: ['/images/portfolio-cube.jpg', '/images/portfolio-cube-detail.jpg'],
    title: '기하학적 입체 디자인 큐브 오브제',
    category: '커스텀 브랜딩·소품',
    material: 'Matte PLA (White & Mint)',
    duration: '2일',
    description: '내부 채움 형태를 조형 예술적으로 시각화하기 위해 특수 기하학적 내부 격자망이 도입된 장식용 디자인 오브제 세트입니다. 무광 필라멘트 텍스처와 비비드한 민트 컬러로 프리미엄 인테리어 효과를 자아냅니다.'
  },
  {
    image: '/images/portfolio-apartment-floor.jpg',
    title: '아파트 세대 평면 스케일 모형',
    category: '건축·도시 모형',
    material: 'Matte PLA (White)',
    duration: '3일',
    description: '건축 내부 인테리어 및 발코니 확장 타당성 조사를 위한 정교한 세대 유닛 평면 모형입니다. 칸막이 벽체와 문틀, 계단 디테일이 정해진 축척 스케일에 엄격하게 맞추어 조립되었습니다.'
  },
  {
    image: '/images/portfolio-yellow-lattice.jpg',
    title: 'FDM 황색 완충 격자 구조체',
    category: '출력 공정·기술 쇼케이스',
    material: 'PLA (Yellow)',
    duration: '2일',
    description: 'FDM 방식을 활용해 정교한 완충 필 패턴을 검증한 황색 격자 구조체 시제품입니다.'
  },
  {
    image: '/images/portfolio-drill-housing.jpg',
    title: '전동 공구 본체 하우징 시제품',
    category: '제품 디자인 목업',
    material: 'ABS (White)',
    duration: '3일',
    description: '실제 조립 및 작동성 테스트를 위한 무선 전동 드릴의 내부 고정부 및 외부 하우징 정밀 FDM 출력물입니다.'
  },
  {
    image: '/images/portfolio-desktop-trays.jpg',
    title: '적층형 미니 데스크 수납 트레이',
    category: '인테리어·데스크 소품',
    material: 'PLA (White)',
    duration: '2일',
    description: '다양한 소품을 보관할 수 있도록 모듈식으로 적층 가능한 미니 데스크 오거나이저 트레이입니다.'
  },
  {
    image: ['/images/portfolio-office-model-1.jpg', '/images/portfolio-office-model-2.jpg'],
    title: '복층 사무용 빌딩 내부 건축 모형',
    category: '건축·도시 모형',
    material: 'Matte PLA',
    duration: '5일',
    description: '복층 빌딩의 기둥식 구조와 슬라브, 계단 및 내부 실 구획을 상세하게 구현한 조립식 건축 스케일 모형입니다.'
  },
  {
    image: ['/images/portfolio-corrugated-organizer-1.jpg', '/images/portfolio-corrugated-organizer-2.jpg'],
    title: '모듈러 주름 패턴 데스크 오거나이저',
    category: '인테리어·데스크 소품',
    material: 'PLA (White)',
    duration: '3일',
    description: '주름 패턴을 적용하여 미학성과 강도를 동시에 높인 분할/결합식 모듈러 데스크 오거나이저입니다.'
  },
  {
    image: '/images/portfolio-translucent-spine.jpg',
    title: '고정밀 투명 레진 척추 모형',
    category: '의료·교육용 모형',
    material: '투명 Resin (SLA)',
    duration: '2일',
    description: 'SLA 투명 레진 방식을 활용해 내부 유동 구조 검증 및 정형외과 학습용으로 제작된 고정밀 척추 스켈레톤 모형입니다.'
  },
  {
    image: '/images/portfolio-organic-support-test.jpg',
    title: 'FDM 유기적 서포트 구조 테스트',
    category: '출력 공정·기술 쇼케이스',
    material: 'PLA (White)',
    duration: '4일',
    description: '유기적인 트리 서포트(Tree Support) 최적화 배치와 공정 안정성을 테스트하기 위해 베드 위에 직접 출력한 격자 조형물입니다.'
  },
  {
    image: '/images/portfolio-controller-panel.jpg',
    title: '제어 컨트롤러 산업용 키패드 하우징',
    category: '전자기기·제어기 케이스',
    material: 'PLA (Gray)',
    duration: '4일',
    description: '산업 설비용 디스플레이 및 스위치 입력부를 보호하고 고정하기 위한 컨트롤 플러그 케이스 어셈블리 소량 생산품입니다.'
  },
  {
    image: [
      '/uploads/portfolio/media__1782526650697.jpg',
      '/uploads/portfolio/media__1782526650699.jpg'
    ],
    title: '환기구 루버 그릴 커버 시제품',
    category: '구조 부품 & 소량 양산',
    material: 'ABS (White)',
    duration: '2일',
    description: '산업용 장비나 배기구의 공기 순환을 위해 설계된 환기 루버 그릴 커버 시제품입니다. 각 슬랫(Slat)의 균일한 두께와 각도를 FDM 공법으로 정밀 구현하였으며, 설치용 볼트 홀과 보강 프레임의 치수 안정성을 확보했습니다.'
  }
];

// Local JSON DB helpers
const DB_PATH = path.join(process.cwd(), 'data', 'db.json');
let writeQueue = Promise.resolve();

async function readLocalDB() {
  try {
    const data = await readFile(DB_PATH, 'utf-8');
    const parsed = JSON.parse(data);
    
    // Seed default portfolios in local DB if missing (regardless of total count)
    if (!parsed.portfolios) parsed.portfolios = [];
    if (!parsed.mhbGameUsers) parsed.mhbGameUsers = [];
    
    // Seed default portfolios in local DB only if version 6 seeding has not run
    if (parsed.seededVersion !== 6) {
      if (!parsed.deletedDefaults) parsed.deletedDefaults = [];
      // Retroactively add "로켓 엔진 노즐 정밀 시제품" to deletedDefaults since the user deleted it earlier
      if (!parsed.deletedDefaults.includes('로켓 엔진 노즐 정밀 시제품')) {
        parsed.deletedDefaults.push('로켓 엔진 노즐 정밀 시제품');
      }
      
      // Also delete it from parsed.portfolios if it's there
      parsed.portfolios = parsed.portfolios.filter(p => p.title !== '로켓 엔진 노즐 정밀 시제품');
      
      const existingTitles = new Set(parsed.portfolios.map(p => p.title));
      const deletedSet = new Set(parsed.deletedDefaults);
      let localDBModified = false;
      
      defaultPortfolios.forEach((item, idx) => {
        if (!existingTitles.has(item.title) && !deletedSet.has(item.title)) {
          parsed.portfolios.push({
            id: `p_default_new_${idx + 1}`,
            createdAt: new Date().toISOString(),
            ...item
          });
          localDBModified = true;
        }
      });
      
      parsed.seededVersion = 6;
      localDBModified = true;
      
      if (localDBModified) {
        await writeLocalDB(parsed);
      }
    }
    
    // v5: Apply category migration to local DB
    if (!parsed.categoryMigrationV5) {
      let localV5Modified = false;
      parsed.portfolios = parsed.portfolios.map(p => {
        const newCat = CATEGORY_V5_MAP[p.title];
        if (newCat && p.category !== newCat) {
          localV5Modified = true;
          return { ...p, category: newCat };
        }
        return p;
      });
      parsed.categoryMigrationV5 = true;
      localV5Modified = true;
      if (localV5Modified) {
        await writeLocalDB(parsed);
      }
    }
    
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') {
      const initial = { 
        quotes: [], 
        contacts: [], 
        seededVersion: 6,
        categoryMigrationV5: true,
        deletedDefaults: ['로켓 엔진 노즐 정밀 시제품'],
        mhbGameUsers: [],
        portfolios: defaultPortfolios
          .filter(item => item.title !== '로켓 엔진 노즐 정밀 시제품')
          .map((item, idx) => ({
            id: `p_default_${idx + 1}`,
            createdAt: new Date().toISOString(),
            ...item
          }))
      };
      await writeLocalDB(initial);
      return initial;
    }
    throw error;
  }
}

async function writeLocalDB(data) {
  const nextWrite = new Promise((resolve, reject) => {
    writeQueue.then(async () => {
      try {
        const dir = path.dirname(DB_PATH);
        await mkdir(dir, { recursive: true });
        await writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
  writeQueue = nextWrite.catch(() => {});
  return nextWrite;
}

// Table initialization for Vercel Postgres
let isInitialized = false;
async function ensureInit() {
  if (!isProductionDB || isInitialized) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS quotes (
        id VARCHAR(50) PRIMARY KEY,
        status VARCHAR(20) DEFAULT '대기중',
        admin_notes TEXT DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        name VARCHAR(100) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        email VARCHAR(100) NOT NULL,
        method VARCHAR(50),
        material VARCHAR(50),
        quantity INTEGER DEFAULT 1,
        deadline VARCHAR(50),
        description TEXT NOT NULL,
        file_name VARCHAR(255),
        file_url TEXT,
        file_size BIGINT
      );
    `;
    await sql`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS email VARCHAR(100) DEFAULT '';`;
    await sql`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS amount INTEGER;`;
    await sql`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_key VARCHAR(200);`;
    await sql`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;`;
    await sql`
      CREATE TABLE IF NOT EXISTS contacts (
        id VARCHAR(50) PRIMARY KEY,
        status VARCHAR(20) DEFAULT '대기중',
        admin_notes TEXT DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL,
        type VARCHAR(50),
        message TEXT NOT NULL
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS portfolios (
        id VARCHAR(50) PRIMARY KEY,
        image TEXT NOT NULL,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        material VARCHAR(255) NOT NULL,
        duration VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(50) PRIMARY KEY,
        value TEXT NOT NULL
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS mhb_game_users (
        id VARCHAR(50) PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        level INTEGER DEFAULT 1,
        exp INTEGER DEFAULT 0,
        score INTEGER DEFAULT 0,
        satiety INTEGER DEFAULT 80,
        hydration INTEGER DEFAULT 80,
        stress INTEGER DEFAULT 20,
        feed_count INTEGER DEFAULT 0,
        water_count INTEGER DEFAULT 0,
        play_count INTEGER DEFAULT 0,
        love_count INTEGER DEFAULT 0,
        last_action_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await sql`ALTER TABLE mhb_game_users ALTER COLUMN password TYPE VARCHAR(255);`;
    await sql`ALTER TABLE mhb_game_users ADD COLUMN IF NOT EXISTS satiety INTEGER DEFAULT 80;`;
    await sql`ALTER TABLE db_mhb_game_users ADD COLUMN IF NOT EXISTS satiety INTEGER DEFAULT 80;`.catch(() => {});
    await sql`ALTER TABLE mhb_game_users ADD COLUMN IF NOT EXISTS hydration INTEGER DEFAULT 80;`;
    await sql`ALTER TABLE mhb_game_users ADD COLUMN IF NOT EXISTS stress INTEGER DEFAULT 20;`;
    await sql`
      CREATE TABLE IF NOT EXISTS shared_files (
        code VARCHAR(32) PRIMARY KEY,
        file_name VARCHAR(255) NOT NULL,
        file_url TEXT,
        file_size BIGINT NOT NULL,
        saved_name VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `;
    await sql`ALTER TABLE shared_files ALTER COLUMN code TYPE VARCHAR(32);`;
    
    // Seed default portfolios only if v4 seeding has not run
    const { rows: settings } = await sql`SELECT value FROM system_settings WHERE key = 'seeded_defaults_v4';`;
    const isSeeded = settings.length > 0 && settings[0].value === 'true';
    
    if (!isSeeded) {
      // Retroactively record "로켓 엔진 노즐 정밀 시제품" as deleted in system_settings
      await sql`
        INSERT INTO system_settings (key, value)
        VALUES ('deleted_default_로켓 엔진 노즐 정밀 시제품', 'true')
        ON CONFLICT (key) DO UPDATE SET value = 'true';
      `;
      
      // Clean it up from portfolios table if it was re-seeded
      await sql`DELETE FROM portfolios WHERE title = '로켓 엔진 노즐 정밀 시제품';`;
      
      // Get all deleted defaults from system_settings
      const { rows: deletedSettings } = await sql`
        SELECT key FROM system_settings WHERE key LIKE 'deleted_default_%';
      `;
      const deletedSet = new Set(
        deletedSettings.map(s => s.key.replace('deleted_default_', ''))
      );
      
      const { rows: existingRows } = await sql`SELECT title FROM portfolios;`;
      const existingTitles = new Set(existingRows.map(r => r.title));
      
      for (const item of defaultPortfolios) {
        if (!existingTitles.has(item.title) && !deletedSet.has(item.title)) {
          const id = `p_default_${Math.random().toString(36).substr(2, 9)}`;
          const createdAt = new Date().toISOString();
          const imageValue = Array.isArray(item.image) ? JSON.stringify(item.image) : item.image;
          await sql`
            INSERT INTO portfolios (id, image, title, category, material, duration, description, created_at)
            VALUES (${id}, ${imageValue}, ${item.title}, ${item.category}, ${item.material}, ${item.duration}, ${item.description}, ${createdAt});
          `;
        }
      }
      
      await sql`
        INSERT INTO system_settings (key, value)
        VALUES ('seeded_defaults_v4', 'true')
        ON CONFLICT (key) DO UPDATE SET value = 'true';
      `;
    }
    
    // v5: Category restructuring migration - update all portfolios to new taxonomy
    const { rows: v5Settings } = await sql`SELECT value FROM system_settings WHERE key = 'category_migration_v5';`;
    const isMigratedV5 = v5Settings.length > 0 && v5Settings[0].value === 'true';
    
    if (!isMigratedV5) {
      for (const [title, newCategory] of Object.entries(CATEGORY_V5_MAP)) {
        await sql`
          UPDATE portfolios SET category = ${newCategory} WHERE title = ${title};
        `;
      }
      await sql`
        INSERT INTO system_settings (key, value)
        VALUES ('category_migration_v5', 'true')
        ON CONFLICT (key) DO UPDATE SET value = 'true';
      `;
    }
    
    // v6: Seed the new Louver Cover portfolio item to production Postgres
    const { rows: v6Settings } = await sql`SELECT value FROM system_settings WHERE key = 'seeded_defaults_v6';`;
    const isSeededV6 = v6Settings.length > 0 && v6Settings[0].value === 'true';
    
    if (!isSeededV6) {
      const { rows: existingRows } = await sql`SELECT id FROM portfolios WHERE title = '환기구 루버 그릴 커버 시제품';`;
      if (existingRows.length === 0) {
        const id = 'p_default_new_louver';
        const createdAt = new Date().toISOString();
        const item = {
          image: [
            '/uploads/portfolio/media__1782526650697.jpg',
            '/uploads/portfolio/media__1782526650699.jpg'
          ],
          title: '환기구 루버 그릴 커버 시제품',
          category: '구조 부품 & 소량 양산',
          material: 'ABS (White)',
          duration: '2일',
          description: '산업용 장비나 배기구의 공기 순환을 위해 설계된 환기 루버 그릴 커버 시제품입니다. 각 슬랫(Slat)의 균일한 두께와 각도를 FDM 공법으로 정밀 구현하였으며, 설치용 볼트 홀과 보강 프레임의 치수 안정성을 확보했습니다.'
        };
        await sql`
          INSERT INTO portfolios (id, image, title, category, material, duration, description, created_at)
          VALUES (${id}, ${JSON.stringify(item.image)}, ${item.title}, ${item.category}, ${item.material}, ${item.duration}, ${item.description}, ${createdAt});
        `;
      }
      await sql`
        INSERT INTO system_settings (key, value)
        VALUES ('seeded_defaults_v6', 'true')
        ON CONFLICT (key) DO UPDATE SET value = 'true';
      `;
    }
    
    isInitialized = true;
  } catch (err) {
    console.error('Failed to initialize Vercel Postgres tables:', err);
  }
}

function mapQuoteRow(r) {
  return {
    id: r.id,
    status: r.status,
    adminNotes: r.admin_notes,
    createdAt: r.created_at.toISOString(),
    name: r.name,
    phone: r.phone,
    email: r.email,
    method: r.method,
    material: r.material,
    quantity: r.quantity,
    deadline: r.deadline,
    description: r.description,
    file: r.file_name ? {
      name: r.file_name,
      url: r.file_url,
      size: parseInt(r.file_size, 10),
    } : null,
    amount: r.amount ?? null,
    paymentKey: r.payment_key ?? null,
    paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
  };
}

export async function getQuotes() {
  if (isProductionDB) {
    await ensureInit();
    try {
      const { rows } = await sql`SELECT * FROM quotes ORDER BY created_at DESC;`;
      return rows.map(mapQuoteRow);
    } catch (err) {
      console.error('Postgres getQuotes error, falling back to local DB:', err);
    }
  }
  
  const db = await readLocalDB();
  return db.quotes || [];
}

export async function saveQuote(quote) {
  const id = `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const status = '대기중';
  const adminNotes = '';
  const createdAt = new Date().toISOString();
  
  if (isProductionDB) {
    await ensureInit();
    try {
      const fileName = quote.file ? quote.file.name : null;
      const fileUrl = quote.file ? quote.file.url : null;
      const fileSize = quote.file ? quote.file.size : null;
      
      await sql`
        INSERT INTO quotes (
          id, status, admin_notes, created_at, name, phone, email, method, material, quantity, deadline, description, file_name, file_url, file_size
        ) VALUES (
          ${id}, ${status}, ${adminNotes}, ${createdAt}, ${quote.name}, ${quote.phone}, ${quote.email}, ${quote.method}, ${quote.material}, ${quote.quantity}, ${quote.deadline}, ${quote.description}, ${fileName}, ${fileUrl}, ${fileSize}
        );
      `;
      return { id, status, adminNotes, createdAt, ...quote };
    } catch (err) {
      console.error('Postgres saveQuote error:', err);
      if (process.env.VERCEL) {
        throw err;
      }
      console.log('Falling back to local DB...');
    }
  }
  
  const db = await readLocalDB();
  if (!db.quotes) db.quotes = [];
  const newQuote = { id, status, adminNotes, createdAt, ...quote };
  db.quotes.push(newQuote);
  await writeLocalDB(db);
  return newQuote;
}

export async function updateQuote(id, updates) {
  if (isProductionDB) {
    await ensureInit();
    try {
      const { rows } = await sql`SELECT * FROM quotes WHERE id = ${id};`;
      if (rows.length === 0) return null;
      
      const current = rows[0];
      const status = updates.status !== undefined ? updates.status : current.status;
      const admin_notes = updates.adminNotes !== undefined ? updates.adminNotes : current.admin_notes;
      const amount = updates.amount !== undefined ? updates.amount : current.amount;
      const payment_key = updates.paymentKey !== undefined ? updates.paymentKey : current.payment_key;
      const paid_at = updates.paidAt !== undefined ? updates.paidAt : current.paid_at;
      
      const { rows: updatedRows } = await sql`
        UPDATE quotes
        SET status = ${status}, admin_notes = ${admin_notes}, amount = ${amount}, payment_key = ${payment_key}, paid_at = ${paid_at}
        WHERE id = ${id}
        RETURNING *;
      `;
      
      if (updatedRows.length === 0) return null;
      return mapQuoteRow(updatedRows[0]);
    } catch (err) {
      console.error('Postgres updateQuote error:', err);
      if (process.env.VERCEL) {
        throw err;
      }
      console.log('Falling back to local DB...');
    }
  }
  
  const db = await readLocalDB();
  const idx = db.quotes.findIndex((q) => q.id === id);
  if (idx === -1) return null;
  
  db.quotes[idx] = {
    ...db.quotes[idx],
    // undefined는 기존값 유지 (JSON 저장 시 키가 사라지는 것 방지)
    ...Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined)),
    updatedAt: new Date().toISOString(),
  };
  await writeLocalDB(db);
  return db.quotes[idx];
}

export async function getContacts() {
  if (isProductionDB) {
    await ensureInit();
    try {
      const { rows } = await sql`SELECT * FROM contacts ORDER BY created_at DESC;`;
      return rows.map((r) => ({
        id: r.id,
        status: r.status,
        adminNotes: r.admin_notes,
        createdAt: r.created_at.toISOString(),
        name: r.name,
        email: r.email,
        type: r.type,
        message: r.message,
      }));
    } catch (err) {
      console.error('Postgres getContacts error, falling back to local DB:', err);
    }
  }
  
  const db = await readLocalDB();
  return db.contacts || [];
}

export async function saveContact(contact) {
  const id = `c_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const status = '대기중';
  const adminNotes = '';
  const createdAt = new Date().toISOString();
  
  if (isProductionDB) {
    await ensureInit();
    try {
      await sql`
        INSERT INTO contacts (
          id, status, admin_notes, created_at, name, email, type, message
        ) VALUES (
          ${id}, ${status}, ${adminNotes}, ${createdAt}, ${contact.name}, ${contact.email}, ${contact.type}, ${contact.message}
        );
      `;
      return { id, status, adminNotes, createdAt, ...contact };
    } catch (err) {
      console.error('Postgres saveContact error:', err);
      if (process.env.VERCEL) {
        throw err;
      }
      console.log('Falling back to local DB...');
    }
  }
  
  const db = await readLocalDB();
  if (!db.contacts) db.contacts = [];
  const newContact = { id, status, adminNotes, createdAt, ...contact };
  db.contacts.push(newContact);
  await writeLocalDB(db);
  return newContact;
}

export async function updateContact(id, updates) {
  if (isProductionDB) {
    await ensureInit();
    try {
      const { rows } = await sql`SELECT * FROM contacts WHERE id = ${id};`;
      if (rows.length === 0) return null;
      
      const current = rows[0];
      const status = updates.status !== undefined ? updates.status : current.status;
      const admin_notes = updates.adminNotes !== undefined ? updates.admin_notes : current.admin_notes;
      
      const { rows: updatedRows } = await sql`
        UPDATE contacts
        SET status = ${status}, admin_notes = ${admin_notes}
        WHERE id = ${id}
        RETURNING *;
      `;
      
      if (updatedRows.length === 0) return null;
      const r = updatedRows[0];
      return {
        id: r.id,
        status: r.status,
        adminNotes: r.admin_notes,
        createdAt: r.created_at.toISOString(),
        name: r.name,
        email: r.email,
        type: r.type,
        message: r.message,
      };
    } catch (err) {
      console.error('Postgres updateContact error:', err);
      if (process.env.VERCEL) {
        throw err;
      }
      console.log('Falling back to local DB...');
    }
  }
  
  const db = await readLocalDB();
  const idx = db.contacts.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  
  db.contacts[idx] = {
    ...db.contacts[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await writeLocalDB(db);
  return db.contacts[idx];
}

function parseImages(imageField) {
  if (!imageField) return [];
  if (typeof imageField === 'string' && imageField.trim().startsWith('[')) {
    try {
      return JSON.parse(imageField);
    } catch (e) {
      // fallback if parsing fails
    }
  }
  if (Array.isArray(imageField)) {
    return imageField;
  }
  return [imageField];
}

export async function getPortfolios() {
  if (isProductionDB) {
    await ensureInit();
    try {
      const { rows } = await sql`SELECT * FROM portfolios ORDER BY created_at DESC;`;
      return rows.map((r) => ({
        id: r.id,
        image: parseImages(r.image),
        title: r.title,
        category: r.category,
        material: r.material,
        duration: r.duration,
        description: r.description,
        createdAt: r.created_at.toISOString(),
      }));
    } catch (err) {
      console.error('Postgres getPortfolios error, falling back to local DB:', err);
    }
  }
  
  const db = await readLocalDB();
  return (db.portfolios || []).map((p) => ({
    ...p,
    image: parseImages(p.image)
  }));
}

export async function savePortfolio(portfolio) {
  const id = `p_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const createdAt = new Date().toISOString();
  const imageValue = Array.isArray(portfolio.image) ? JSON.stringify(portfolio.image) : portfolio.image;
  
  if (isProductionDB) {
    await ensureInit();
    try {
      await sql`
        INSERT INTO portfolios (
          id, image, title, category, material, duration, description, created_at
        ) VALUES (
          ${id}, ${imageValue}, ${portfolio.title}, ${portfolio.category}, ${portfolio.material}, ${portfolio.duration}, ${portfolio.description}, ${createdAt}
        );
      `;
      return { id, createdAt, ...portfolio, image: parseImages(imageValue) };
    } catch (err) {
      console.error('Postgres savePortfolio error:', err);
      if (process.env.VERCEL) {
        throw err;
      }
      console.log('Falling back to local DB...');
    }
  }
  
  const db = await readLocalDB();
  if (!db.portfolios) db.portfolios = [];
  const newPortfolio = { id, createdAt, ...portfolio, image: imageValue };
  db.portfolios.push(newPortfolio);
  await writeLocalDB(db);
  return { ...newPortfolio, image: parseImages(imageValue) };
}

export async function updatePortfolio(id, updates) {
  const imageValue = updates.image !== undefined ? (Array.isArray(updates.image) ? JSON.stringify(updates.image) : updates.image) : undefined;
  
  if (isProductionDB) {
    await ensureInit();
    try {
      const { rows } = await sql`SELECT * FROM portfolios WHERE id = ${id};`;
      if (rows.length === 0) return null;
      
      const current = rows[0];
      const image = imageValue !== undefined ? imageValue : current.image;
      const title = updates.title !== undefined ? updates.title : current.title;
      const category = updates.category !== undefined ? updates.category : current.category;
      const material = updates.material !== undefined ? updates.material : current.material;
      const duration = updates.duration !== undefined ? updates.duration : current.duration;
      const description = updates.description !== undefined ? updates.description : current.description;
      
      const { rows: updatedRows } = await sql`
        UPDATE portfolios
        SET image = ${image}, title = ${title}, category = ${category}, material = ${material}, duration = ${duration}, description = ${description}
        WHERE id = ${id}
        RETURNING *;
      `;
      
      if (updatedRows.length === 0) return null;
      const r = updatedRows[0];
      return {
        id: r.id,
        image: parseImages(r.image),
        title: r.title,
        category: r.category,
        material: r.material,
        duration: r.duration,
        description: r.description,
        createdAt: r.created_at.toISOString(),
      };
    } catch (err) {
      console.error('Postgres updatePortfolio error:', err);
      if (process.env.VERCEL) {
        throw err;
      }
      console.log('Falling back to local DB...');
    }
  }
  
  const db = await readLocalDB();
  const idx = db.portfolios.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  
  const current = db.portfolios[idx];
  const image = imageValue !== undefined ? imageValue : current.image;
  
  db.portfolios[idx] = {
    ...current,
    ...updates,
    image,
    updatedAt: new Date().toISOString(),
  };
  await writeLocalDB(db);
  return {
    ...db.portfolios[idx],
    image: parseImages(db.portfolios[idx].image)
  };
}

export async function deletePortfolio(id) {
  if (isProductionDB) {
    await ensureInit();
    try {
      const { rows: itemRows } = await sql`SELECT title FROM portfolios WHERE id = ${id};`;
      if (itemRows.length > 0) {
        const deletedTitle = itemRows[0].title;
        const isDefault = defaultPortfolios.some(d => d.title === deletedTitle);
        if (isDefault) {
          const key = `deleted_default_${deletedTitle}`;
          await sql`
            INSERT INTO system_settings (key, value)
            VALUES (${key}, 'true')
            ON CONFLICT (key) DO UPDATE SET value = 'true';
          `;
        }
      }
      const { rows } = await sql`DELETE FROM portfolios WHERE id = ${id} RETURNING id;`;
      return rows.length > 0;
    } catch (err) {
      console.error('Postgres deletePortfolio error:', err);
      if (process.env.VERCEL) {
        throw err;
      }
      console.log('Falling back to local DB...');
    }
  }
  
  const db = await readLocalDB();
  const idx = db.portfolios.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  
  const deletedItem = db.portfolios[idx];
  const isDefault = defaultPortfolios.some(d => d.title === deletedItem.title);
  if (isDefault) {
    if (!db.deletedDefaults) db.deletedDefaults = [];
    if (!db.deletedDefaults.includes(deletedItem.title)) {
      db.deletedDefaults.push(deletedItem.title);
    }
  }
  
  db.portfolios.splice(idx, 1);
  await writeLocalDB(db);
  return true;
}

export async function getMhbUser(username) {
  if (isProductionDB) {
    await ensureInit();
    try {
      const { rows } = await sql`SELECT * FROM mhb_game_users WHERE username = ${username};`;
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        id: r.id,
        username: r.username,
        password: r.password,
        level: r.level,
        exp: r.exp,
        score: r.score,
        satiety: r.satiety,
        hydration: r.hydration,
        stress: r.stress,
        feedCount: r.feed_count,
        waterCount: r.water_count,
        playCount: r.play_count,
        loveCount: r.love_count,
        lastActionTime: r.last_action_time ? r.last_action_time.toISOString() : new Date().toISOString(),
        createdAt: r.created_at.toISOString()
      };
    } catch (err) {
      console.error('Postgres getMhbUser error, falling back to local DB:', err);
    }
  }
  
  const db = await readLocalDB();
  const user = db.mhbGameUsers.find(u => u.username === username);
  return user ? { ...user } : null;
}

export async function createMhbUser(username, password) {
  const id = `u_${Math.random().toString(36).substr(2, 9)}`;
  const createdAt = new Date().toISOString();
  const lastActionTime = createdAt;
  const userObj = {
    id,
    username,
    password,
    level: 1,
    exp: 0,
    score: 0,
    satiety: 80,
    hydration: 80,
    stress: 20,
    feedCount: 0,
    waterCount: 0,
    playCount: 0,
    loveCount: 0,
    lastActionTime,
    createdAt
  };

  if (isProductionDB) {
    await ensureInit();
    try {
      await sql`
        INSERT INTO mhb_game_users (id, username, password, level, exp, score, satiety, hydration, stress, feed_count, water_count, play_count, love_count, last_action_time, created_at)
        VALUES (${id}, ${username}, ${password}, 1, 0, 0, 80, 80, 20, 0, 0, 0, 0, ${lastActionTime}, ${createdAt});
      `;
      return userObj;
    } catch (err) {
      console.error('Postgres createMhbUser error:', err);
      if (process.env.VERCEL) {
        throw err;
      }
      console.log('Falling back to local DB...');
    }
  }

  const db = await readLocalDB();
  db.mhbGameUsers.push(userObj);
  await writeLocalDB(db);
  return userObj;
}

export async function updateMhbUserPassword(id, password) {
  if (isProductionDB) {
    await ensureInit();
    try {
      const { rows } = await sql`
        UPDATE mhb_game_users
        SET password = ${password}
        WHERE id = ${id}
        RETURNING id;
      `;
      return rows.length > 0;
    } catch (err) {
      console.error('Postgres updateMhbUserPassword error:', err);
      if (process.env.VERCEL) throw err;
    }
  }

  const db = await readLocalDB();
  const idx = db.mhbGameUsers.findIndex((user) => user.id === id);
  if (idx === -1) return false;
  db.mhbGameUsers[idx].password = password;
  await writeLocalDB(db);
  return true;
}

export async function updateMhbUser(id, updates) {
  if (isProductionDB) {
    await ensureInit();
    try {
      const level = updates.level !== undefined ? updates.level : null;
      const exp = updates.exp !== undefined ? updates.exp : null;
      const score = updates.score !== undefined ? updates.score : null;
      const satiety = updates.satiety !== undefined ? updates.satiety : null;
      const hydration = updates.hydration !== undefined ? updates.hydration : null;
      const stress = updates.stress !== undefined ? updates.stress : null;
      const feedCount = updates.feedCount !== undefined ? updates.feedCount : null;
      const waterCount = updates.waterCount !== undefined ? updates.waterCount : null;
      const playCount = updates.playCount !== undefined ? updates.playCount : null;
      const loveCount = updates.loveCount !== undefined ? updates.loveCount : null;
      const lastActionTime = updates.lastActionTime !== undefined ? updates.lastActionTime : new Date().toISOString();

      const { rows } = await sql`
        UPDATE mhb_game_users
        SET 
          level = COALESCE(${level}, level),
          exp = COALESCE(${exp}, exp),
          score = COALESCE(${score}, score),
          satiety = COALESCE(${satiety}, satiety),
          hydration = COALESCE(${hydration}, hydration),
          stress = COALESCE(${stress}, stress),
          feed_count = COALESCE(${feedCount}, feed_count),
          water_count = COALESCE(${waterCount}, water_count),
          play_count = COALESCE(${playCount}, play_count),
          love_count = COALESCE(${loveCount}, love_count),
          last_action_time = ${lastActionTime}
        WHERE id = ${id}
        RETURNING *;
      `;
      if (rows.length > 0) {
        const r = rows[0];
        return {
          id: r.id,
          username: r.username,
          password: r.password,
          level: r.level,
          exp: r.exp,
          score: r.score,
          satiety: r.satiety,
          hydration: r.hydration,
          stress: r.stress,
          feedCount: r.feed_count,
          waterCount: r.water_count,
          playCount: r.play_count,
          loveCount: r.love_count,
          lastActionTime: r.last_action_time.toISOString(),
          createdAt: r.created_at.toISOString()
        };
      }
    } catch (err) {
      console.error('Postgres updateMhbUser error:', err);
      if (process.env.VERCEL) {
        throw err;
      }
      console.log('Falling back to local DB...');
    }
  }

  const db = await readLocalDB();
  const idx = db.mhbGameUsers.findIndex(u => u.id === id);
  if (idx !== -1) {
    db.mhbGameUsers[idx] = {
      ...db.mhbGameUsers[idx],
      ...updates,
      lastActionTime: updates.lastActionTime || new Date().toISOString()
    };
    await writeLocalDB(db);
    return { ...db.mhbGameUsers[idx] };
  }
  return null;
}

export async function getMhbLeaderboard() {
  if (isProductionDB) {
    await ensureInit();
    try {
      const { rows } = await sql`
        SELECT id, username, level, exp, score, satiety, hydration, stress, feed_count, water_count, play_count, love_count, last_action_time
        FROM mhb_game_users
        ORDER BY level DESC, exp DESC, score DESC
        LIMIT 20;
      `;
      return rows.map(r => ({
        id: r.id,
        username: r.username,
        level: r.level,
        exp: r.exp,
        score: r.score,
        satiety: r.satiety,
        hydration: r.hydration,
        stress: r.stress,
        feedCount: r.feed_count,
        waterCount: r.water_count,
        playCount: r.play_count,
        loveCount: r.love_count,
        lastActionTime: r.last_action_time ? r.last_action_time.toISOString() : null
      }));
    } catch (err) {
      console.error('Postgres getMhbLeaderboard error, falling back to local DB:', err);
    }
  }

  const db = await readLocalDB();
  const sorted = [...db.mhbGameUsers]
    .sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level;
      if (b.exp !== a.exp) return b.exp - a.exp;
      return b.score - a.score;
    })
    .slice(0, 20)
    .map(u => ({
      id: u.id,
      username: u.username,
      level: u.level,
      exp: u.exp,
      score: u.score,
      satiety: u.satiety,
      hydration: u.hydration,
      stress: u.stress,
      feedCount: u.feedCount,
      waterCount: u.waterCount,
      playCount: u.playCount,
      loveCount: u.loveCount,
      lastActionTime: u.lastActionTime
    }));
  return sorted;
}

// --- System Settings helpers ---
export async function getSystemSetting(key, defaultValue = '') {
  if (isProductionDB) {
    await ensureInit();
    try {
      const { rows } = await sql`SELECT value FROM system_settings WHERE key = ${key};`;
      if (rows.length > 0) {
        return rows[0].value;
      }
      return defaultValue;
    } catch (err) {
      console.error(`Postgres getSystemSetting error for key ${key}:`, err);
    }
  }

  const db = await readLocalDB();
  if (!db.systemSettings) db.systemSettings = {};
  return db.systemSettings[key] !== undefined ? db.systemSettings[key] : defaultValue;
}

export async function setSystemSetting(key, value) {
  if (isProductionDB) {
    await ensureInit();
    try {
      await sql`
        INSERT INTO system_settings (key, value)
        VALUES (${key}, ${value})
        ON CONFLICT (key)
        DO UPDATE SET value = ${value};
      `;
      return true;
    } catch (err) {
      console.error(`Postgres setSystemSetting error for key ${key}:`, err);
      if (process.env.VERCEL) {
        throw err;
      }
    }
  }

  const db = await readLocalDB();
  if (!db.systemSettings) db.systemSettings = {};
  db.systemSettings[key] = value;
  await writeLocalDB(db);
  return true;
}

// --- Shared Files helpers ---
export async function getSharedFiles() {
  if (isProductionDB) {
    await ensureInit();
    try {
      const { rows } = await sql`SELECT * FROM shared_files ORDER BY created_at DESC;`;
      return rows.map((r) => ({
        code: r.code,
        fileName: r.file_name,
        fileUrl: r.file_url,
        fileSize: parseInt(r.file_size, 10),
        savedName: r.saved_name,
        createdAt: r.created_at.toISOString(),
        expiresAt: r.expires_at.toISOString(),
      }));
    } catch (err) {
      console.error('Postgres getSharedFiles error, falling back to local DB:', err);
    }
  }
  
  const db = await readLocalDB();
  return db.sharedFiles || [];
}

export async function getSharedFile(code) {
  if (isProductionDB) {
    await ensureInit();
    try {
      const { rows } = await sql`SELECT * FROM shared_files WHERE code = ${code};`;
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        code: r.code,
        fileName: r.file_name,
        fileUrl: r.file_url,
        fileSize: parseInt(r.file_size, 10),
        savedName: r.saved_name,
        createdAt: r.created_at.toISOString(),
        expiresAt: r.expires_at.toISOString(),
      };
    } catch (err) {
      console.error('Postgres getSharedFile error, falling back to local DB:', err);
    }
  }
  
  const db = await readLocalDB();
  const file = (db.sharedFiles || []).find((f) => f.code === code);
  return file ? { ...file } : null;
}

export async function saveSharedFile(file) {
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days later
  
  if (isProductionDB) {
    await ensureInit();
    try {
      await sql`
        INSERT INTO shared_files (
          code, file_name, file_url, file_size, saved_name, created_at, expires_at
        ) VALUES (
          ${file.code}, ${file.fileName}, ${file.fileUrl}, ${file.fileSize}, ${file.savedName}, ${createdAt}, ${expiresAt}
        );
      `;
      return { createdAt, expiresAt, ...file };
    } catch (err) {
      console.error('Postgres saveSharedFile error:', err);
      if (process.env.VERCEL) {
        throw err;
      }
      console.log('Falling back to local DB...');
    }
  }
  
  const db = await readLocalDB();
  if (!db.sharedFiles) db.sharedFiles = [];
  const newFile = { createdAt, expiresAt, ...file };
  db.sharedFiles.push(newFile);
  await writeLocalDB(db);
  return newFile;
}

export async function deleteSharedFile(code) {
  if (isProductionDB) {
    await ensureInit();
    try {
      const { rows } = await sql`DELETE FROM shared_files WHERE code = ${code} RETURNING code;`;
      return rows.length > 0;
    } catch (err) {
      console.error('Postgres deleteSharedFile error:', err);
      if (process.env.VERCEL) {
        throw err;
      }
      console.log('Falling back to local DB...');
    }
  }
  
  const db = await readLocalDB();
  const idx = (db.sharedFiles || []).findIndex((f) => f.code === code);
  if (idx === -1) return false;
  db.sharedFiles.splice(idx, 1);
  await writeLocalDB(db);
  return true;
}

export async function cleanupExpiredFiles() {
  const now = new Date();
  const files = await getSharedFiles();
  const expired = files.filter((f) => new Date(f.expiresAt) < now);
  
  for (const file of expired) {
    try {
      // 1. Delete from storage
      if (file.fileUrl) {
        // Vercel Blob
        if (process.env.BLOB_READ_WRITE_TOKEN) {
          await del(file.fileUrl);
        }
      } else if (file.savedName) {
        // Local file
        const filePath = path.join(process.cwd(), 'uploads', 'shared', file.savedName);
        await unlink(filePath).catch(() => {});
      }
      
      // 2. Delete from DB
      await deleteSharedFile(file.code);
      console.log(`Cleaned up expired file: ${file.fileName} (${file.code})`);
    } catch (err) {
      console.error(`Failed to cleanup expired file ${file.code}:`, err);
    }
  }
}

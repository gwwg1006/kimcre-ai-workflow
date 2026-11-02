import { NextResponse } from 'next/server';
import { getPortfolios } from '@/lib/db';

// Public portfolio data is shared by all visitors. Cache it at the edge and
// invalidate it whenever an administrator changes a portfolio item.
export const dynamic = 'force-static';
export const revalidate = 3600;

const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
};

export async function GET() {
  try {
    const portfolios = await getPortfolios();
    return NextResponse.json(portfolios, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error('Failed to get portfolios:', error);
    return NextResponse.json(
      { error: '포트폴리오 목록을 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

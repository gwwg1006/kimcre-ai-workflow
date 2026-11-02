import { NextResponse } from 'next/server';
import { getMhbLeaderboard } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const leaderboard = await getMhbLeaderboard();
    return NextResponse.json({
      success: true,
      leaderboard
    });
  } catch (error) {
    console.error('MHB Game Leaderboard API error:', error);
    return NextResponse.json(
      { error: '리더보드를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

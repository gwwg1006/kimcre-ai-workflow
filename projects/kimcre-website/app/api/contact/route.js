import { NextResponse } from 'next/server';
import { saveContact } from '@/lib/db';

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, email, type, message } = body;
    
    // Validate required fields
    if (!name || !email || !message) {
      return NextResponse.json(
        { error: '필수 입력 항목이 누락되었습니다.' },
        { status: 400 }
      );
    }
    
    const saved = await saveContact({
      name,
      email,
      type: type || '일반 문의',
      message,
    });
    
    return NextResponse.json({ success: true, contact: saved });
  } catch (error) {
    console.error('Contact submission error:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

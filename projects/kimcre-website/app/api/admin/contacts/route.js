import { NextResponse } from 'next/server';
import { getContacts, updateContact } from '@/lib/db';
import { verifyAdminToken } from '@/lib/auth';

function checkAuth(request) {
  const token = request.cookies.get('admin_session')?.value;
  return verifyAdminToken(token);
}

export async function GET(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
  }

  try {
    const contacts = await getContacts();
    const sortedContacts = [...contacts].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    return NextResponse.json(sortedContacts);
  } catch (error) {
    console.error('Failed to get contacts:', error);
    return NextResponse.json(
      { error: '데이터를 가져오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: '인증되지 않은 요청입니다.' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, status, adminNotes } = body;

    if (!id) {
      return NextResponse.json({ error: '아이디가 필요합니다.' }, { status: 400 });
    }

    const updates = {};
    if (status !== undefined) updates.status = status;
    if (adminNotes !== undefined) updates.adminNotes = adminNotes;

    const updated = await updateContact(id, updates);
    if (!updated) {
      return NextResponse.json({ error: '해당 문의를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update contact:', error);
    return NextResponse.json(
      { error: '업데이트 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

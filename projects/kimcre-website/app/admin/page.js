import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAdminToken } from '@/lib/auth';

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_session')?.value;
  const session = verifyAdminToken(token);

  if (session) {
    redirect('/admin/dashboard');
  } else {
    redirect('/admin/login');
  }
}

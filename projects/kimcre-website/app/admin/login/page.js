import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAdminToken } from '@/lib/auth';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_session')?.value;
  const session = verifyAdminToken(token);

  // If already logged in, go straight to dashboard
  if (session) {
    redirect('/admin/dashboard');
  }

  return <LoginForm />;
}

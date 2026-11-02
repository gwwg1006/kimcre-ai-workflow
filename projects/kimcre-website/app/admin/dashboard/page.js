import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAdminToken } from '@/lib/auth';
import { getQuotes, getContacts, getPortfolios } from '@/lib/db';
import DashboardView from './DashboardView';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_session')?.value;
  const session = verifyAdminToken(token);

  // Guard route
  if (!session) {
    redirect('/admin/login');
  }

  const initialQuotes = await getQuotes();
  const initialContacts = await getContacts();
  const initialPortfolios = await getPortfolios();

  // Sort by newest first
  const sortedQuotes = [...initialQuotes].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  const sortedContacts = [...initialContacts].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  const sortedPortfolios = [...initialPortfolios].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  return (
    <DashboardView 
      initialQuotes={sortedQuotes} 
      initialContacts={sortedContacts} 
      initialPortfolios={sortedPortfolios} 
    />
  );
}

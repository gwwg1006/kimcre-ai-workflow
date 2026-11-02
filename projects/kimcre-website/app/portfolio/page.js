import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import PortfolioGrid from '@/components/PortfolioGrid';
import { Button } from '@/components/ui/button';
import { getPortfolios } from '@/lib/db';

// The portfolio is refreshed immediately when an admin changes it.
export const revalidate = 3600;

export const metadata = {
  title: '포트폴리오 | 김명규크리에이티브',
  description: '김명규크리에이티브의 다양한 3D 프린팅 작업물을 확인하세요.',
};

export default async function PortfolioPage() {
  let initialPortfolios = [];
  try {
    initialPortfolios = await getPortfolios();
  } catch (error) {
    console.error('Failed to fetch portfolios on portfolio page:', error);
  }

  return (
    <>
      <PageHeader
        kicker="Portfolio"
        title="제작 사례"
        description="건축 모형부터 지그, 전자기기 케이스, 소량 양산까지. 실제로 만들어 납품한 작업들입니다."
      />
      <section className="container-site py-12 md:py-16">
        <Suspense fallback={<p className="py-16 text-center text-sm text-muted-foreground">포트폴리오 불러오는 중…</p>}>
          <PortfolioGrid initialPortfolios={initialPortfolios} />
        </Suspense>
      </section>
      <section className="container-site">
        <div className="flex flex-col gap-6 border-t pt-10 md:flex-row md:items-center md:justify-between">
          <p className="text-2xl font-semibold tracking-tight">비슷한 걸 만들고 싶으신가요?</p>
          <Button asChild size="lg">
            <Link href="/quote">견적 요청하기 <ArrowUpRight /></Link>
          </Button>
        </div>
      </section>
    </>
  );
}

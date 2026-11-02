import ConfirmPayment from './ConfirmPayment';

export const metadata = {
  title: '결제 확인 | 김명규크리에이티브',
  robots: { index: false, follow: false },
};

export default async function PaySuccessPage({ params, searchParams }) {
  const { id } = await params;
  // Toss Pay appends status, orderNo and payMethod to the retUrl.
  const { orderNo = '' } = await searchParams;
  return (
    <section className="container-site flex min-h-[60vh] items-center justify-center py-16">
      <ConfirmPayment quoteId={id} orderNo={orderNo} />
    </section>
  );
}

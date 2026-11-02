import Link from 'next/link';
import PageHeader from '@/components/PageHeader';

export const metadata = {
  title: '환불정책 | 김명규크리에이티브',
  description: '김명규크리에이티브 3D 프린팅 주문제작 서비스의 결제 취소 및 환불정책입니다.',
};

const SECTIONS = [
  {
    title: '1. 적용 범위',
    body: [
      '이 정책은 김명규크리에이티브(kimcre.shop)에서 견적 확정 후 온라인으로 결제한 3D 프린팅 출력, 후가공, 3D 모델링 등 모든 주문제작 서비스에 적용됩니다.',
      '모든 상품은 고객이 제공한 파일과 요청 사양에 따라 개별 제작되는 주문제작 상품입니다.',
    ],
  },
  {
    title: '2. 제작 착수 전 취소',
    body: [
      '결제 후 제작에 착수하기 전에는 언제든지 취소할 수 있으며, 결제 금액 전액을 환불합니다.',
      '제작 착수 시점은 결제 확인 후 담당자가 이메일 또는 카카오톡으로 안내합니다.',
    ],
  },
  {
    title: '3. 제작 착수 후 취소',
    body: [
      '주문제작 상품은 「전자상거래 등에서의 소비자보호에 관한 법률」 제17조 제2항 제5호에 따라, 제작이 시작된 이후에는 단순 변심에 의한 청약철회가 제한됩니다.',
      '다만 출력이 완료되기 전 취소를 요청하시면, 이미 사용된 소재비와 장비 사용분을 제외한 금액을 환불합니다. 공제 금액은 취소 요청 시점의 진행 상황을 기준으로 산정해 사전에 안내합니다.',
      '출력이 완료된 이후에는 단순 변심에 의한 취소 및 환불이 불가합니다.',
    ],
  },
  {
    title: '4. 제작물에 하자가 있는 경우',
    body: [
      '제작물이 확정된 사양(치수, 소재, 수량, 색상 등)과 다르거나 파손·변형 등 하자가 있는 경우, 수령일로부터 7일 이내에 사진과 함께 알려주시면 무상으로 재제작하거나 결제 금액 전액을 환불합니다. 이때 발생하는 배송비는 김명규크리에이티브가 부담합니다.',
      '고객이 제공한 3D 파일 자체의 오류(설계 치수 오류, 두께 부족 등)나 소재의 일반적인 특성(적층 결, 미세한 수축 등)에 따른 결과는 하자로 보지 않습니다. 이러한 부분은 견적 단계에서 최대한 미리 안내해 드립니다.',
    ],
  },
  {
    title: '5. 환불 방법과 기간',
    body: [
      '환불은 결제하신 수단(토스페이 등)의 결제 취소로 처리합니다.',
      '환불이 확정되면 영업일 기준 3일 이내에 결제 취소를 진행하며, 실제 환불 반영 시점은 결제수단과 카드사·은행 사정에 따라 달라질 수 있습니다.',
    ],
  },
  {
    title: '6. 취소·환불 문의',
    body: [
      '이메일 kimcre3d@gmail.com 또는 카카오톡 1:1 오픈채팅으로 견적 번호와 함께 요청해 주세요. 영업일 기준 24시간 안에 답변드립니다.',
    ],
  },
];

export default function RefundPage() {
  return (
    <>
      <PageHeader
        kicker="Refund policy"
        title="환불정책"
        description="주문제작 상품의 결제 취소와 환불 기준을 안내합니다."
      />
      <div className="container-site pb-12 md:pb-16">
        <div className="mx-auto max-w-3xl">
          <p className="mb-10 font-mono text-xs text-muted-foreground">시행일자: 2026년 10월 30일</p>
          {SECTIONS.map((section) => (
            <section key={section.title} className="border-t py-8">
              <h2 className="mb-3 text-lg font-semibold tracking-tight">{section.title}</h2>
              <div className="space-y-3">
                {section.body.map((p) => (
                  <p key={p} className="text-[15px] leading-relaxed text-foreground/80">{p}</p>
                ))}
              </div>
            </section>
          ))}
          <p className="border-t pt-8 text-sm text-muted-foreground">
            개인정보 처리에 관한 내용은 <Link href="/privacy" className="underline underline-offset-2">개인정보처리방침</Link>을 확인해 주세요.
          </p>
        </div>
      </div>
    </>
  );
}

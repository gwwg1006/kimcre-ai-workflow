import PageHeader from '@/components/PageHeader';

export const metadata = {
  title: '개인정보처리방침 | 김명규크리에이티브',
  description: '김명규크리에이티브의 개인정보처리방침입니다. 고객님의 개인정보를 보호하고 관련 법률을 준수하기 위한 안내입니다.',
};

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        kicker="Privacy policy"
        title="개인정보처리방침"
        description="김명규크리에이티브는 고객님의 개인정보를 중요시하며, 「개인정보 보호법」 등 관련 법령을 준수하고 있습니다."
      />

      {/* Main Content */}
      <div className="container-site py-12 md:py-16">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 font-mono text-xs text-muted-foreground">
            시행일자: 2024년 1월 1일 | 최종 수정일자: 2026년 10월 30일
          </div>

          {/* 제1조 */}
          <section className="border-t py-8">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">제1조 (개인정보의 처리 목적 및 수집 항목)</h2>
            <p className="text-[15px] leading-relaxed text-foreground/80">
              김명규크리에이티브는 별도의 회원가입 절차 없이 문의 접수 및 3D 프린팅 견적 상담 서비스를 제공하고 있습니다. 서비스 이용 과정에서 최소한의 개인정보만을 수집하며, 처리 목적 이외의 용도로는 활용되지 않습니다.
            </p>

            <div className="mt-4 overflow-x-auto rounded-md border">
              <table className="w-full text-left text-sm [&_td]:border-t [&_td]:p-3 [&_td]:align-top [&_th]:bg-muted [&_th]:p-3 [&_th]:font-medium">
                <thead>
                  <tr>
                    <th>수집 지점 / 서비스</th>
                    <th>수집 목적</th>
                    <th>수집 항목 (필수/선택)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>이메일 문의 (`/contact`)</strong></td>
                    <td>고객 문의 사항 확인, 본인 확인 및 상담 답변 전달</td>
                    <td>
                      - 필수: 이름, 이메일, 문의 내용<br />
                      - 선택: 문의 유형
                    </td>
                  </tr>
                  <tr>
                    <td><strong>견적 요청 (`/quote`)</strong></td>
                    <td>3D 프린팅 맞춤 견적 산출, 파일 검토 및 연락</td>
                    <td>
                      - 필수: 이름, 연락처(전화번호), 이메일, 프로젝트 설명<br />
                      - 선택: 출력 방식, 희망 소재, 수량, 희망 납기일, 첨부파일(3D 모델링 도면/파일)
                    </td>
                  </tr>
                  <tr>
                    <td><strong>간편 견적 (홈)</strong></td>
                    <td>3D 프린팅 견적 산출 및 견적서 전달</td>
                    <td>
                      - 필수: 이름, 연락처(전화번호), 이메일, 첨부파일(3D 모델링 파일)<br />
                      - 선택: 출력 방식, 수량
                    </td>
                  </tr>
                  <tr>
                    <td><strong>온라인 결제 (`/pay`)</strong></td>
                    <td>확정된 견적 금액의 결제 처리 및 결제 내역 확인</td>
                    <td>
                      - 필수: 결제 승인 정보(결제 키, 결제 일시, 결제 금액)<br />
                      - 토스 계정·결제수단 정보는 토스페이(비바리퍼블리카)가 직접 수집하며 당사는 저장하지 않습니다.
                    </td>
                  </tr>
                  <tr>
                    <td><strong>서비스 이용 과정 자동 수집</strong></td>
                    <td>서비스 안정성 확보, 웹사이트 사용 통계 분석 및 보안 강화</td>
                    <td>IP 주소, 쿠키(Cookie), 방문 일시, 서비스 이용 기록, 기기/브라우저 정보</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 제2조 */}
          <section className="border-t py-8">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">제2조 (개인정보의 보유 및 이용 기간)</h2>
            <p className="text-[15px] leading-relaxed text-foreground/80">
              원칙적으로 개인정보 수집 및 이용 목적이 달성된 후(상담 답변 완료 및 견적 산출/상담 종료 시) 해당 정보를 지체 없이 파기합니다. 단, 관계 법령의 규정에 의하여 보존할 필요가 있는 경우 다음과 같이 법령에서 정한 기간 동안 보존합니다.
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li className="text-[15px] leading-relaxed text-foreground/80">
                <strong>전자상거래 등에서의 소비자보호에 관한 법률:</strong> 소비자 불만 또는 분쟁처리에 관한 기록 (3년)
              </li>
              <li className="text-[15px] leading-relaxed text-foreground/80">
                <strong>전자상거래 등에서의 소비자보호에 관한 법률:</strong> 대금결제 및 재화 등의 공급에 관한 기록 (5년)
              </li>
              <li className="text-[15px] leading-relaxed text-foreground/80">
                <strong>통신비밀보호법:</strong> 웹사이트 방문 기록 및 서비스 이용 기록 (3개월)
              </li>
            </ul>
          </section>

          {/* 제3조 */}
          <section className="border-t py-8">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">제3조 (개인정보의 파기절차 및 파기방법)</h2>
            <p className="text-[15px] leading-relaxed text-foreground/80">
              개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체 없이 해당 개인정보를 파기합니다.
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li className="text-[15px] leading-relaxed text-foreground/80">
                <strong>파기 절차:</strong> 이용자가 입력한 정보는 목적 달성 후 내부 방침 및 관련 법령에 따른 보유기간을 거쳐 파기됩니다.
              </li>
              <li className="text-[15px] leading-relaxed text-foreground/80">
                <strong>파기 방법:</strong> 전자적 파일 형태로 저장된 개인정보는 기록을 복구할 수 없는 기술적 방법을 사용하여 삭제하며, 서면 등에 출력된 정보는 분쇄하거나 소각하여 파기합니다.
              </li>
            </ul>
          </section>

          {/* 제4조 */}
          <section className="border-t py-8">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">제4조 (개인정보의 제3자 제공)</h2>
            <p className="text-[15px] leading-relaxed text-foreground/80">
              김명규크리에이티브는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만, 아래의 경우에는 예외로 합니다.
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li className="text-[15px] leading-relaxed text-foreground/80">이용자가 사전에 동의한 경우</li>
              <li className="text-[15px] leading-relaxed text-foreground/80">법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
            </ul>
          </section>

          {/* 제5조 */}
          <section className="border-t py-8">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">제5조 (개인정보 처리 위탁)</h2>
            <p className="text-[15px] leading-relaxed text-foreground/80">
              원활한 서비스 이행 및 품질 향상을 위하여 다음과 같이 외부 전문업체에 개인정보 처리를 위탁하고 있습니다. 위탁 계약 시 관련 법령에 따라 개인정보가 안전하게 관리될 수 있도록 필요한 사항을 규정하고 있습니다.
            </p>
            <div className="mt-4 overflow-x-auto rounded-md border">
              <table className="w-full text-left text-sm [&_td]:border-t [&_td]:p-3 [&_td]:align-top [&_th]:bg-muted [&_th]:p-3 [&_th]:font-medium">
                <thead>
                  <tr>
                    <th>수탁업체 (외부 서비스)</th>
                    <th>위탁 업무 내용</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Vercel Inc.</td>
                    <td>웹 애플리케이션 호스팅 및 클라우드 데이터베이스/스토리지 인프라 운영</td>
                  </tr>
                  <tr>
                    <td>(주)비바리퍼블리카 (토스페이)</td>
                    <td>전자결제 대행 (결제 승인 및 결제수단 정보 처리)</td>
                  </tr>
                  <tr>
                    <td>Nodemailer (이메일 시스템)</td>
                    <td>견적 요청 및 문의 접수 시 자동 알림 메일 발송</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 제6조 */}
          <section className="border-t py-8">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">제6조 (정보주체와 법정대리인의 권리·의무 및 그 행사방법)</h2>
            <p className="text-[15px] leading-relaxed text-foreground/80">
              이용자는 언제든지 등록되어 있는 자신의 개인정보에 대한 열람, 정정, 삭제, 처리정지를 요구할 수 있습니다.
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li className="text-[15px] leading-relaxed text-foreground/80">
                권리 행사는 개인정보 보호책임자 및 담당부서에 서면, 이메일(`kimcre3d@gmail.com`)을 통해 요청하실 수 있으며, 확인 즉시 지체 없이 조치하겠습니다.
              </li>
              <li className="text-[15px] leading-relaxed text-foreground/80">
                이용자가 개인정보의 오류에 대한 정정 및 삭제를 요청한 경우에는 조치를 완료할 때까지 당해 개인정보를 이용하거나 제공하지 않습니다.
              </li>
            </ul>
          </section>

          {/* 제7조 */}
          <section className="border-t py-8">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">제7조 (개인정보의 안전성 확보 조치)</h2>
            <p className="text-[15px] leading-relaxed text-foreground/80">
              개인정보의 안전성 확보를 위해 다음과 같은 기술적·관리적 조치를 취하고 있습니다.
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li className="text-[15px] leading-relaxed text-foreground/80">
                <strong>기술적 조치:</strong> 보안 연결(SSL/HTTPS) 적용, 통신 데이터 암호화, 접근 권한 통제
              </li>
              <li className="text-[15px] leading-relaxed text-foreground/80">
                <strong>관리적 조치:</strong> 개인정보 취급 직원의 최소화 및 안전 관리를 위한 내부 정기 관리
              </li>
            </ul>
          </section>

          {/* 제8조 */}
          <section className="border-t py-8">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">제8조 (개인정보 자동 수집 장치의 설치·운영 및 거부)</h2>
            <p className="text-[15px] leading-relaxed text-foreground/80">
              이용자에게 개별적인 맞춤서비스 및 원활한 환경을 제공하기 위해 쿠키(Cookie) 및 브라우저 세션 데이터를 사용할 수 있습니다.
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5">
              <li className="text-[15px] leading-relaxed text-foreground/80">
                <strong>쿠키의 사용 목적:</strong> 이용자의 접속 환경 및 웹사이트 사용 편의성 최적화
              </li>
              <li className="text-[15px] leading-relaxed text-foreground/80">
                <strong>쿠키 설정 및 거부 방법:</strong> 이용자는 웹 브라우저의 옵션 설정을 통해 쿠키 허용, 확인, 또는 전체 거부를 선택할 수 있습니다. (예: Chrome 기준 [설정] &gt; [개인정보 및 보안] &gt; [쿠키 및 기타 사이트 데이터])
              </li>
            </ul>
          </section>

          {/* 제9조 */}
          <section className="border-t py-8">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">제9조 (개인정보 보호책임자 및 담당자 연락처)</h2>
            <p className="text-[15px] leading-relaxed text-foreground/80">
              개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 정보주체의 불만처리 및 피해구제 등을 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
            </p>
            <div className="mt-4 divide-y rounded-md border">
              <div className="flex gap-4 px-4 py-3 text-sm">
                <span className="w-24 shrink-0 text-muted-foreground">상호 / 서비스명:</span>
                <span>김명규크리에이티브</span>
              </div>
              <div className="flex gap-4 px-4 py-3 text-sm">
                <span className="w-24 shrink-0 text-muted-foreground">개인정보 보호책임자:</span>
                <span>김명규 대표</span>
              </div>
              <div className="flex gap-4 px-4 py-3 text-sm">
                <span className="w-24 shrink-0 text-muted-foreground">이메일 문의:</span>
                <span>kimcre3d@gmail.com</span>
              </div>
              <div className="flex gap-4 px-4 py-3 text-sm">
                <span className="w-24 shrink-0 text-muted-foreground">주소:</span>
                <span>경기도 성남시 분당구</span>
              </div>
            </div>
          </section>

          {/* 제10조 */}
          <section className="border-t py-8">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">제10조 (개인정보 처리방침의 변경)</h2>
            <p className="text-[15px] leading-relaxed text-foreground/80">
              본 개인정보처리방침은 법령, 정책 또는 보안기술의 변경에 따라 내용의 추가, 삭제 및 수정이 있을 시에는 개정 최소 7일 전부터 웹사이트 공지사항 또는 해당 페이지를 통해 고지할 것입니다.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

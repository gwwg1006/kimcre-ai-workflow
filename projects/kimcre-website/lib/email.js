import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

/**
 * 견적 접수 알림 이메일 발송 (관리자 전송용)
 * @param {Object} quote - 견적 데이터
 */
export async function sendQuoteNotification(quote) {
  const {
    name,
    phone,
    email,
    method,
    material,
    quantity,
    deadline,
    description,
    file,
    id,
    createdAt,
  } = quote;

  const submittedAt = createdAt
    ? new Date(createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    : new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

  const htmlBody = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>새 견적 접수 알림</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', '맑은 고딕', sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 40px 10px;">
    <tr>
      <td align="center">
        <!-- Card Container -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(79, 70, 229, 0.08); border: 1px solid #E2E8F0;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #1E1B4B 0%, #312E81 100%); padding: 40px 30px; text-align: left;">
              <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #818CF8; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px;">ADMIN NOTIFICATION</span>
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #FFFFFF;">📋 새 견적이 접수되었습니다</h1>
              <p style="margin: 8px 0 0; font-size: 12px; color: #A5B4FC;">접수번호: #${id || 'N/A'} &nbsp;·&nbsp; 접수 시각: ${submittedAt}</p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 40px 30px; text-align: left;">
              
              <!-- Customer Info Table -->
              <h2 style="margin: 0 0 14px; font-size: 15px; font-weight: 700; color: #1E293B; border-bottom: 2px solid #E2E8F0; padding-bottom: 8px;">신청 고객 정보</h2>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 30px;">
                <tr>
                  <td style="padding: 10px 8px; font-size: 13px; color: #64748B; font-weight: 600; width: 100px; border-bottom: 1px solid #F1F5F9;">이름</td>
                  <td style="padding: 10px 8px; font-size: 14px; color: #1E293B; font-weight: 700; border-bottom: 1px solid #F1F5F9;">${name}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 8px; font-size: 13px; color: #64748B; font-weight: 600; border-bottom: 1px solid #F1F5F9;">연락처</td>
                  <td style="padding: 10px 8px; font-size: 14px; color: #4F46E5; font-weight: 700; border-bottom: 1px solid #F1F5F9;">
                    <a href="tel:${phone.replace(/-/g, '')}" style="color: #4F46E5; text-decoration: none;">${phone}</a>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 10px 8px; font-size: 13px; color: #64748B; font-weight: 600; border-bottom: none;">이메일</td>
                  <td style="padding: 10px 8px; font-size: 14px; color: #4F46E5; font-weight: 700; border-bottom: none;">
                    ${email ? `<a href="mailto:${email}" style="color: #4F46E5; text-decoration: none;">${email}</a>` : '미입력'}
                  </td>
                </tr>
              </table>

              <!-- Quote Details Table -->
              <h2 style="margin: 0 0 14px; font-size: 15px; font-weight: 700; color: #1E293B; border-bottom: 2px solid #E2E8F0; padding-bottom: 8px;">견적 요청 상세</h2>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 30px;">
                <tr>
                  <td style="padding: 10px 8px; font-size: 13px; color: #64748B; font-weight: 600; width: 100px; border-bottom: 1px solid #F1F5F9;">출력 방식</td>
                  <td style="padding: 10px 8px; font-size: 14px; color: #1E293B; border-bottom: 1px solid #F1F5F9;">${method || '미선택'}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 8px; font-size: 13px; color: #64748B; font-weight: 600; border-bottom: 1px solid #F1F5F9;">희망 소재</td>
                  <td style="padding: 10px 8px; font-size: 14px; color: #1E293B; border-bottom: 1px solid #F1F5F9;">${material || '미선택'}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 8px; font-size: 13px; color: #64748B; font-weight: 600; border-bottom: 1px solid #F1F5F9;">수량</td>
                  <td style="padding: 10px 8px; font-size: 14px; color: #1E293B; font-weight: 700; border-bottom: 1px solid #F1F5F9;">${quantity}개</td>
                </tr>
                <tr>
                  <td style="padding: 10px 8px; font-size: 13px; color: #64748B; font-weight: 600; border-bottom: 1px solid #F1F5F9;">희망 납기</td>
                  <td style="padding: 10px 8px; font-size: 14px; color: #1E293B; border-bottom: 1px solid #F1F5F9;">${deadline || '무관'}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 8px; font-size: 13px; color: #64748B; font-weight: 600; border-bottom: none;">첨부 파일</td>
                  <td style="padding: 10px 8px; font-size: 14px; color: #1E293B; border-bottom: none;">
                    ${file ? `<span style="display: inline-block; background-color: rgba(79, 70, 229, 0.05); color: #4F46E5; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-right: 6px;">📎 ${file.name}</span> (${(file.size / 1024).toFixed(1)} KB)${file.url ? `<br /><a href="${file.url}" style="display: inline-block; margin-top: 6px; color: #4F46E5; font-size: 12px; font-weight: 700; text-decoration: none;">파일 다운로드 &rarr;</a>` : ''}` : '없음'}
                  </td>
                </tr>
              </table>

              <!-- Description Box -->
              <h2 style="margin: 0 0 14px; font-size: 15px; font-weight: 700; color: #1E293B; border-bottom: 2px solid #E2E8F0; padding-bottom: 8px;">프로젝트 설명</h2>
              <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 18px; font-size: 13px; color: #334155; line-height: 1.6; white-space: pre-wrap; margin-bottom: 30px;">${description}</div>

              <!-- Admin CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="https://kimcre.shop/admin" style="display: inline-block; background-color: #4F46E5; color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 14px; font-weight: 700; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.15);">관리자 대시보드 바로가기 &rarr;</a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F8FAFC; padding: 24px 30px; border-top: 1px solid #F1F5F9; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #94A3B8; line-height: 1.5;">
                본 메일은 김명규크리에이티브 웹사이트 시스템에서 자동 발송되었습니다.<br />
                © KMK Creative. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  await transporter.sendMail({
    from: `"김명규크리에이티브 알림" <${process.env.GMAIL_USER}>`,
    to: process.env.GMAIL_USER,
    subject: `[견적 접수] ${name}님으로부터 새 견적이 접수되었습니다`,
    html: htmlBody,
  });
}

/**
 * 견적 신청자(고객)에게 접수 완료 확인 메일 발송
 * @param {Object} quote - 견적 데이터
 */
export async function sendQuoteConfirmationToUser(quote) {
  const { name, email, id, method, quantity, createdAt } = quote;
  if (!email) return;

  const submittedAt = createdAt
    ? new Date(createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    : new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

  const htmlBody = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>견적 요청 접수 완료</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', '맑은 고딕', sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 40px 10px;">
    <tr>
      <td align="center">
        <!-- Card Container -->
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(79, 70, 229, 0.06); border: 1px solid #E2E8F0;">
          
          <!-- Header Banner -->
          <tr>
            <td align="center" style="background: linear-gradient(135deg, #4F46E5 0%, #6366F1 100%); padding: 40px 30px;">
              <span style="display: inline-block; font-size: 11px; font-weight: 700; color: rgba(255, 255, 255, 0.8); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 10px;">KIMMYUNGKYU CREATIVE</span>
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.5px;">💡 견적 요청이 정상 접수되었습니다</h1>
              <p style="margin: 8px 0 0; font-size: 13px; color: rgba(255, 255, 255, 0.85);">AI 간편 견적 도우미 실시간 수신 안내</p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 40px 30px; text-align: left;">
              <p style="margin: 0 0 16px; font-size: 16px; font-weight: 700; color: #1E293B;">안녕하세요, ${name}님!</p>
              <p style="margin: 0 0 30px; font-size: 14px; line-height: 1.6; color: #475569;">
                제출해 주신 3D 파일 분석 및 견적 요청이 성공적으로 접수되었습니다. <br />
                현재 AI 엔진이 볼륨 및 가공 형태를 분석하고 있으며, 확인 즉시 최종 견적서를 발송해 드리겠습니다.
              </p>

              <!-- Specs Box -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; border-radius: 12px; border: 1px solid #F1F5F9; padding: 24px; margin-bottom: 30px;">
                <tr>
                  <td>
                    <h2 style="margin: 0 0 16px; font-size: 14px; font-weight: 700; color: #1E293B; border-bottom: 2px solid #E2E8F0; padding-bottom: 8px;">신청 내역 요약</h2>
                    
                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      <!-- Row 1 -->
                      <tr>
                        <td style="padding: 10px 0; font-size: 13px; color: #64748B; font-weight: 600; text-align: left; border-bottom: 1px dashed #E2E8F0;">접수 번호</td>
                        <td style="padding: 10px 0; font-size: 13px; color: #1E293B; font-weight: 700; text-align: right; border-bottom: 1px dashed #E2E8F0;">#${id || '대기중'}</td>
                      </tr>
                      <!-- Row 2 -->
                      <tr>
                        <td style="padding: 10px 0; font-size: 13px; color: #64748B; font-weight: 600; text-align: left; border-bottom: 1px dashed #E2E8F0;">접수 시각</td>
                        <td style="padding: 10px 0; font-size: 13px; color: #1E293B; font-weight: 700; text-align: right; border-bottom: 1px dashed #E2E8F0;">${submittedAt}</td>
                      </tr>
                      <!-- Row 3 -->
                      <tr>
                        <td style="padding: 10px 0; font-size: 13px; color: #64748B; font-weight: 600; text-align: left; border-bottom: 1px dashed #E2E8F0;">출력 방식</td>
                        <td style="padding: 10px 0; font-size: 13px; color: #1E293B; font-weight: 700; text-align: right; border-bottom: 1px dashed #E2E8F0;">${method || '미선택'}</td>
                      </tr>
                      <!-- Row 4 -->
                      <tr>
                        <td style="padding: 10px 0; font-size: 13px; color: #64748B; font-weight: 600; text-align: left; border-bottom: none;">신청 수량</td>
                        <td style="padding: 10px 0; font-size: 13px; color: #1E293B; font-weight: 700; text-align: right; border-bottom: none;">${quantity}개</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Warning Banner -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: rgba(79, 70, 229, 0.04); border-left: 4px solid #4F46E5; border-radius: 4px; margin-bottom: 10px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #4F46E5; font-weight: 600;">
                      🔔 대기 시간 안내<br />
                      영업시간 기준 1시간 이내에 입력하신 이메일 및 연락처로 최종 견적서가 발송될 예정입니다. 조금만 기다려주세요!
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F8FAFC; padding: 24px 30px; border-top: 1px solid #F1F5F9; text-align: center;">
              <p style="margin: 0 0 6px; font-size: 12px; color: #64748B; font-weight: 700;">김명규크리에이티브 (KMK Creative)</p>
              <p style="margin: 0; font-size: 11px; color: #94A3B8; line-height: 1.5;">
                본 메일은 발신전용 메일이므로 회신되지 않습니다.<br />
                © KMK Creative. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  await transporter.sendMail({
    from: `"김명규크리에이티브" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `[김명규크리에이티브] AI 간편 견적 접수 확인 메일 (#${id || ''})`,
    html: htmlBody,
  });
}

/**
 * 고객에게 견적 금액 확정 및 결제 링크 메일 발송
 * @param {Object} quote - 견적 데이터 (amount 포함)
 */
export async function sendPaymentRequest(quote) {
  const { name, email, id, method, material, quantity, amount } = quote;
  if (!email) return;

  const payUrl = `https://kimcre.shop/pay/${id}`;
  const formattedAmount = `${Number(amount).toLocaleString('ko-KR')}원`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>견적 확정 및 결제 안내</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', '맑은 고딕', sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(79, 70, 229, 0.06); border: 1px solid #E2E8F0;">
          <tr>
            <td align="center" style="background: linear-gradient(135deg, #4F46E5 0%, #6366F1 100%); padding: 40px 30px;">
              <span style="display: inline-block; font-size: 11px; font-weight: 700; color: rgba(255, 255, 255, 0.8); letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 10px;">KIMMYUNGKYU CREATIVE</span>
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.5px;">💳 견적이 확정되었습니다</h1>
              <p style="margin: 8px 0 0; font-size: 13px; color: rgba(255, 255, 255, 0.85);">아래 링크에서 결제를 진행해 주세요</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px; text-align: left;">
              <p style="margin: 0 0 16px; font-size: 16px; font-weight: 700; color: #1E293B;">안녕하세요, ${name}님!</p>
              <p style="margin: 0 0 30px; font-size: 14px; line-height: 1.6; color: #475569;">
                요청하신 3D 프린팅 견적 금액이 확정되었습니다.<br />
                결제가 완료되면 바로 제작을 시작하겠습니다.
              </p>

              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; border-radius: 12px; border: 1px solid #F1F5F9; padding: 24px; margin-bottom: 30px;">
                <tr>
                  <td>
                    <h2 style="margin: 0 0 16px; font-size: 14px; font-weight: 700; color: #1E293B; border-bottom: 2px solid #E2E8F0; padding-bottom: 8px;">견적 내역</h2>
                    <table width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding: 10px 0; font-size: 13px; color: #64748B; font-weight: 600; text-align: left; border-bottom: 1px dashed #E2E8F0;">접수 번호</td>
                        <td style="padding: 10px 0; font-size: 13px; color: #1E293B; font-weight: 700; text-align: right; border-bottom: 1px dashed #E2E8F0;">#${id}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; font-size: 13px; color: #64748B; font-weight: 600; text-align: left; border-bottom: 1px dashed #E2E8F0;">출력 방식</td>
                        <td style="padding: 10px 0; font-size: 13px; color: #1E293B; font-weight: 700; text-align: right; border-bottom: 1px dashed #E2E8F0;">${method || '미선택'}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; font-size: 13px; color: #64748B; font-weight: 600; text-align: left; border-bottom: 1px dashed #E2E8F0;">소재</td>
                        <td style="padding: 10px 0; font-size: 13px; color: #1E293B; font-weight: 700; text-align: right; border-bottom: 1px dashed #E2E8F0;">${material || '미선택'}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; font-size: 13px; color: #64748B; font-weight: 600; text-align: left; border-bottom: 1px dashed #E2E8F0;">수량</td>
                        <td style="padding: 10px 0; font-size: 13px; color: #1E293B; font-weight: 700; text-align: right; border-bottom: 1px dashed #E2E8F0;">${quantity}개</td>
                      </tr>
                      <tr>
                        <td style="padding: 14px 0 0; font-size: 14px; color: #1E293B; font-weight: 700; text-align: left;">결제 금액</td>
                        <td style="padding: 14px 0 0; font-size: 18px; color: #4F46E5; font-weight: 800; text-align: right;">${formattedAmount}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="${payUrl}" style="display: inline-block; background-color: #4F46E5; color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-size: 14px; font-weight: 700; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.15);">결제하기 &rarr;</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 16px 0 0; font-size: 12px; color: #94A3B8; text-align: center; word-break: break-all;">${payUrl}</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #F8FAFC; padding: 24px 30px; border-top: 1px solid #F1F5F9; text-align: center;">
              <p style="margin: 0 0 6px; font-size: 12px; color: #64748B; font-weight: 700;">김명규크리에이티브 (KMK Creative)</p>
              <p style="margin: 0; font-size: 11px; color: #94A3B8; line-height: 1.5;">
                본 메일은 발신전용 메일이므로 회신되지 않습니다.<br />
                © KMK Creative. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  await transporter.sendMail({
    from: `"김명규크리에이티브" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `[김명규크리에이티브] 견적 확정 및 결제 안내 (#${id})`,
    html: htmlBody,
  });
}

export async function readUploadResponse(response: Response) {
  if (response.status === 413) throw new Error("이미지 용량이 업로드 제한을 초과했습니다. 10MB 이하 이미지를 선택해 주세요.");
  if (response.status === 401 || response.status === 403) throw new Error("등록 권한을 확인할 수 없습니다. 페이지를 새로고침하고 다시 시도해 주세요.");
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`서버 응답을 처리하지 못했습니다 (${response.status}). 잠시 후 다시 시도해 주세요.`); }
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : `등록에 실패했습니다 (${response.status}). 다시 시도해 주세요.`);
  if (!data || typeof data !== "object") throw new Error("잘못된 서버 응답입니다. 다시 시도해 주세요.");
  return data;
}

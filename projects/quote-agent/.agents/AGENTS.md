# 에이전트 개발 규칙 및 환경 설정

## 템플릿 파일 보관 규칙
- 모든 견적서 및 거래명세서 엑셀 양식 파일(.xltx) 원본은 macOS 시스템 Microsoft Excel이 인식하는 기본 사용자 템플릿 경로에 보관합니다.
- 경로: `~/Library/Group Containers/UBF8T346G9.Office/User Content.localized/Templates.localized`
- 프로그램 코드(`src/create_estimate.py`)는 이 경로를 `TEMPLATE_DIR`로 삼아 동적으로 템플릿을 불러옵니다.
- 사용자가 직접 엑셀 템플릿을 열어 수정하고 저장하더라도 프로그램이 해당 변경사항을 즉시 반영할 수 있도록 설계되었습니다.

## openpyxl 시트 복제 및 인쇄 레이아웃 규칙
- openpyxl의 `copy_worksheet()`를 사용하여 시트를 복제하거나 동적으로 워크시트를 새로 생성할 경우, 기존의 `print_area` 및 `page_setup` 속성(용지 크기, 가로세로 방향, 한 페이지 맞춤 스케일)이 복사되지 않고 유실되는 버그가 있습니다.
- 따라서 시트 생성/복사 즉시 다음 설정을 명시적으로 다시 입력해야 합니다:
  1. `sheet.page_setup.paperSize` 설정 (A4 = 9)
  2. `sheet.page_setup.orientation` 설정 (가로/세로)
  3. `sheet.sheet_properties.pageSetUpPr.fitToPage = True` 설정
  4. `sheet.page_setup.fitToWidth = 1` 및 `sheet.page_setup.fitToHeight = 1` 지정 (한 페이지에 맞추기)
  5. `sheet.print_area`에 고유 시트명을 포함한 범위 재할당 (예: `f"'{sheet.title}'!$B$2:$AF$39"`)

## 엑셀 도장(이미지) 유지 규칙
- `openpyxl`의 `copy_worksheet()`는 원본 시트의 이미지(도장 등)를 자동으로 복사하지 않는 한계가 있습니다.
- 따라서 시트를 복제할 때 반드시 원본 시트의 `_images` 배열을 순회하며 `copy` 모듈을 이용해 이미지를 수동으로 새 시트에 `add_image` 해주어야 도장이 유실되지 않고 유지됩니다.

## 견적서 빌드 가장 빠른 방법
- **명령어**: 사용자가 "견적서 만들어줘" 또는 "견적서 작성해줘"라고 요청하면, 제공받은 데이터를 바탕으로 파이썬 스크립트를 즉시 실행하여 엑셀 파일을 생성합니다.
- **실행 방법**:
  1. 데이터를 임시 JSON 파일(예: `scratch/data.json`)로 저장합니다.
  2. 다음 명령어를 실행합니다: `.venv/bin/python src/create_estimate.py --type integrated --file scratch/data.json`
  3. 터미널에 출력된 저장 경로를 사용자에게 안내합니다.
- **특징**: `create_estimate.py`는 품목 16개(제품견적서) 및 5개(거래명세서) 초과 시 자동으로 여러 시트(예: 제품견적서_1, 제품견적서_2)로 분할 처리하도록 구현되어 있습니다.
- **옵션**: `--type` 인자로 `estimate`(제품견적서), `delivery`(거래명세서), `integrated`(통합) 중 선택 가능하며 기본값은 `integrated`를 권장합니다.

## 견적 단가 산정 규칙
- **3D 프린팅 소요 시간 기준**: 사용자가 3D 프린팅 소요 시간표나 데이터를 제공할 경우, 시간당 단가 **3,500원**을 적용하여 총 금액을 계산합니다.
- **계산 방식 예시**: 소요 시간이 '11h 26m'인 경우, `11시간 * 3500원 + (26분 / 60) * 3500원`으로 계산하여 산출합니다. (단위: 원, 소수점 발생 시 반올림 등 적절히 처리)

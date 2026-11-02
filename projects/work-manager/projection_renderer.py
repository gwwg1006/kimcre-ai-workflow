"""Dependency-neutral renderers for project filesystem projections."""


def render_project_markdown(project_no, client_name, job_name, values, items_table_md=""):
    lines = [
        f"# {project_no} {client_name} - {job_name}", "",
        f"- 접수일: {values.get('received_date', '')}",
        f"- 접수채널: {values.get('channel', '')}",
        f"- 고객명: {client_name}", f"- 작업명: {job_name}",
        f"- 수량: {values.get('quantity', values.get('total_quantity', '1'))}",
        f"- 총 수량: {values.get('total_quantity', values.get('quantity', '1'))}",
        f"- 소재: {values.get('material', '')}", f"- 색상: {values.get('color', '')}",
        f"- 대표 소재: {values.get('material', '')}",
        f"- 견적금액: {values.get('quote_amount', 0):,}원",
        f"- 배송비: {values.get('shipping_fee', 0):,}원",
        f"- 과세구분: {values.get('tax_type', '면세')}",
        f"- 총 결제금액: {values.get('total_amount', 0):,}원",
        f"- 제작상태: {values.get('prod_status', '')}", f"- 결제상태: {values.get('pay_status', '')}",
        f"- 배송상태: {values.get('deliv_status', '')}", f"- 납기안내: {values.get('due_date', '')}",
        f"- 배송주소: {values.get('address', '')} {values.get('detail_address', '')}".rstrip(),
        f"- 출력조건: {values.get('request_notes', '')}", f"- 메모: {values.get('memo', '')}",
    ]
    return "\n".join(lines) + items_table_md


_render_project_markdown = render_project_markdown

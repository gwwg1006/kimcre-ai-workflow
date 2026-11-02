from db import get_db_connection


def get_project_by_no(project_no):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM projects WHERE project_no = ?", (project_no,)).fetchone()
        if not row:
            return None
        data = dict(row)
        data["items"] = [dict(item) for item in conn.execute(
            "SELECT * FROM project_items WHERE project_no = ? ORDER BY seq ASC", (project_no,)
        ).fetchall()]
        return data
    finally:
        conn.close()


def get_all_projects(filters=None):
    filters = filters or {}
    conn = get_db_connection()
    try:
        query = "SELECT * FROM projects WHERE 1=1"
        params = []
        query_parts = []
        for column in ("prod_status", "pay_status", "deliv_status", "overall_status"):
            values = filters.get(column)
            if values:
                if isinstance(values, str):
                    values = [values]
                query_parts.append(f" AND {column} IN ({', '.join('?' for _ in values)})")
                params.extend(values)
        query += "".join(query_parts)
        if filters.get("search"):
            term = f"%{filters['search']}%"
            query += " AND (project_no LIKE ? OR client_name LIKE ? OR job_name LIKE ? OR memo LIKE ?)"
            params.extend([term] * 4)
        query += " ORDER BY CASE WHEN overall_status = '완료' OR (prod_status = '제작 완료' AND pay_status = '입금 완료' AND deliv_status = '배송 완료') THEN 1 ELSE 0 END ASC, project_no DESC"
        return [dict(row) for row in conn.execute(query, params).fetchall()]
    finally:
        conn.close()


def get_dashboard_stats():
    conn = get_db_connection()
    try:
        count = lambda sql: conn.execute(sql).fetchone()[0]
        total_count = count("SELECT COUNT(*) FROM projects")
        in_progress = count("SELECT COUNT(*) FROM projects WHERE overall_status = '진행 중'")
        waiting_print = count("SELECT COUNT(*) FROM projects WHERE prod_status IN ('접수', '슬라이싱', '견적 대기')")
        printing = count("SELECT COUNT(*) FROM projects WHERE prod_status = '출력 중'")
        inspecting = count("SELECT COUNT(*) FROM projects WHERE prod_status = '검수'")
        deliv_needed = count("SELECT COUNT(*) FROM projects WHERE deliv_status = '예약 필요'")
        pay_pending = count("SELECT COUNT(*) FROM projects WHERE pay_status IN ('입금 대기', '견적 발송', '부분 입금')")
        completed = count("SELECT COUNT(*) FROM projects WHERE overall_status = '완료'")
        sums = conn.execute("SELECT SUM(total_amount), SUM(paid_amount), SUM(unpaid_amount) FROM projects").fetchone()
        return {
            "total_count": total_count, "in_progress": in_progress, "waiting_print": waiting_print,
            "printing": printing, "inspecting": inspecting, "deliv_needed": deliv_needed,
            "pay_pending": pay_pending, "completed": completed, "total_sales": sums[0] or 0,
            "total_paid": sums[1] or 0, "total_unpaid": sums[2] or 0,
        }
    finally:
        conn.close()

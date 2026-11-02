from datetime import datetime
import unicodedata

from db import get_db_connection


PARTNER_TYPES = ("업체", "개인", "미분류")
_PARTNER_TYPE_ALIASES = {"업체/개인": "미분류", "미분류": "미분류", "업체": "업체", "개인": "개인"}
_PARTNER_LIMITS = {
    "name": 100, "contact_name": 100, "phone": 50, "zipcode": 20,
    "address": 300, "detail_address": 300, "memo": 2000,
}


def normalize_partner_type(value):
    if not isinstance(value, str):
        raise ValueError("거래처 구분이 올바르지 않습니다.")
    canonical = _PARTNER_TYPE_ALIASES.get(value.strip())
    if canonical is None:
        raise ValueError("거래처 구분이 올바르지 않습니다.")
    return canonical


def _validated_text(value, field, *, allow_newline=False):
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValueError("거래처 입력값이 올바르지 않습니다.")
    if len(value) > _PARTNER_LIMITS[field]:
        raise ValueError("거래처 입력값이 너무 깁니다.")
    for char in value:
        code = ord(char)
        if code in {0, 127} or code < 32 and (not allow_newline or char not in "\r\n\t"):
            raise ValueError("거래처 입력값에 허용되지 않은 문자가 있습니다.")
    return " ".join(value.strip().split()) if field != "memo" else value.strip()


def _validated_partner_fields(data, existing=None):
    existing = existing or {}
    name = _validated_text(data.get("name", existing.get("name", "")), "name")
    name = normalize_partner_name(name)
    if not name:
        raise ValueError("거래처명은 필수 입력 항목입니다.")
    result = {"name": name}
    result["partner_type"] = normalize_partner_type(data.get("partner_type", existing.get("partner_type", "미분류")))
    for field in ("contact_name", "phone", "zipcode", "address", "detail_address", "memo"):
        result[field] = _validated_text(data.get(field, existing.get(field, "")), field, allow_newline=field == "memo")
    return result


def normalize_partner_name(value):
    normalized = unicodedata.normalize("NFKC", str(value or ""))
    return " ".join(normalized.strip().split())


def _partner_dict(row):
    return dict(row) if row else None


def _find_partner_row_locked(conn, name, include_inactive=False):
    key = normalize_partner_name(name).casefold()
    rows = conn.execute("SELECT * FROM partners" + ("" if include_inactive else " WHERE is_active = 1") + " ORDER BY id").fetchall()
    return next((row for row in rows if normalize_partner_name(row["name"]).casefold() == key), None)


def migrate_projects_to_partners(cursor):
    cursor.execute("SELECT * FROM partners ORDER BY id")
    partner_by_name = {}
    for row in cursor.fetchall():
        key = normalize_partner_name(row["name"]).casefold()
        if key and key not in partner_by_name:
            partner_by_name[key] = dict(row)
    cursor.execute("""
        SELECT project_no, client_name, contact_name, phone, zipcode, address, detail_address, memo, updated_at
        FROM projects
        ORDER BY COALESCE(updated_at, created_at) DESC, project_no DESC
    """)
    for row in cursor.fetchall():
        name = normalize_partner_name(row["client_name"])
        if not name:
            continue
        key = name.casefold()
        partner = partner_by_name.get(key)
        if partner is None:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("""
                INSERT INTO partners (
                    name, partner_type, contact_name, phone, zipcode, address,
                    detail_address, memo, is_active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """, (name, "미분류", row["contact_name"] or "", row["phone"] or "", row["zipcode"] or "",
                  row["address"] or "", row["detail_address"] or "", row["memo"] or "", now, now))
            partner = {"id": cursor.lastrowid, "name": name, "contact_name": row["contact_name"] or "", "phone": row["phone"] or "",
                       "zipcode": row["zipcode"] or "", "address": row["address"] or "",
                       "detail_address": row["detail_address"] or "", "memo": row["memo"] or ""}
            partner_by_name[key] = partner
        else:
            updates = {}
            for field in ("contact_name", "phone", "zipcode", "address", "detail_address", "memo"):
                if not str(partner.get(field) or "").strip() and str(row[field] or "").strip():
                    updates[field] = row[field]
            if updates:
                updates["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                assignments = ", ".join(f"{field} = ?" for field in updates)
                cursor.execute(f"UPDATE partners SET {assignments} WHERE id = ?", (*updates.values(), partner["id"]))
                partner.update(updates)
        cursor.execute("UPDATE projects SET partner_id = ? WHERE project_no = ? AND (partner_id IS NULL OR partner_id = 0)", (partner["id"], row["project_no"]))


def find_partner_by_name(name, include_inactive=False):
    normalized = normalize_partner_name(name)
    if not normalized:
        return None
    conn = get_db_connection()
    query = "SELECT * FROM partners"
    if not include_inactive:
        query += " WHERE is_active = 1"
    try:
        rows = conn.execute(query + " ORDER BY id").fetchall()
        key = normalized.casefold()
        row = next((candidate for candidate in rows
                    if normalize_partner_name(candidate["name"]).casefold() == key), None)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return _partner_dict(row)


def get_partner_by_id(partner_id):
    try:
        partner_id = int(partner_id)
    except (TypeError, ValueError):
        return None
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM partners WHERE id = ?", (partner_id,)).fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return _partner_dict(row)


def list_partners(search="", include_inactive=False):
    conn = get_db_connection()
    query = """SELECT p.*, COUNT(pr.project_no) AS project_count FROM partners p
               LEFT JOIN projects pr ON pr.partner_id = p.id WHERE 1 = 1"""
    params = []
    if not include_inactive:
        query += " AND p.is_active = 1"
    if search:
        query += " AND (p.name LIKE ? OR p.contact_name LIKE ? OR p.phone LIKE ? OR p.address LIKE ?)"
        term = f"%{search.strip()}%"
        params.extend([term] * 4)
    try:
        rows = [dict(row) for row in conn.execute(query + " GROUP BY p.id ORDER BY p.is_active DESC, p.name COLLATE NOCASE ASC", params).fetchall()]
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return rows


def create_partner(data, allow_duplicate=False):
    fields = _validated_partner_fields(data)
    name = fields["name"]
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        conn.execute("BEGIN IMMEDIATE")
        existing = _find_partner_row_locked(conn, name)
        if existing and not allow_duplicate:
            error = ValueError("이미 등록된 거래처명입니다.")
            error.existing_partner = dict(existing)
            raise error
        cursor.execute("""INSERT INTO partners (name, partner_type, contact_name, phone, zipcode, address,
        detail_address, memo, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)""",
        (fields["name"], fields["partner_type"], fields["contact_name"], fields["phone"],
         fields["zipcode"], fields["address"], fields["detail_address"], fields["memo"], now, now))
        partner_id = cursor.lastrowid
        conn.commit()
        row = conn.execute("SELECT * FROM partners WHERE id = ?", (partner_id,)).fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return dict(row)


def update_partner(partner_id, data):
    conn = get_db_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM partners WHERE id = ?", (partner_id,)).fetchone()
        if not row:
            raise ValueError("거래처를 찾을 수 없습니다.")
        partner = dict(row)
        fields = _validated_partner_fields(data, partner)
        name = fields["name"]
        duplicate = _find_partner_row_locked(conn, name)
        if duplicate and int(duplicate["id"]) != int(partner_id):
            error = ValueError("이미 등록된 거래처명입니다.")
            error.existing_partner = dict(duplicate)
            raise error
        update_fields = ("name", "partner_type", "contact_name", "phone", "zipcode", "address", "detail_address", "memo")
        values = [fields[field] for field in update_fields]
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(f"UPDATE partners SET {', '.join(f'{field} = ?' for field in update_fields)}, updated_at = ? WHERE id = ?", (*values, now, partner_id))
        conn.commit()
        row = conn.execute("SELECT * FROM partners WHERE id = ?", (partner_id,)).fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return dict(row)


def archive_partner(partner_id):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_db_connection()
    try:
        cursor = conn.execute("UPDATE partners SET is_active = 0, updated_at = ? WHERE id = ?", (now, partner_id))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    if cursor.rowcount == 0:
        raise ValueError("거래처를 찾을 수 없습니다.")
    return {"id": int(partner_id), "is_active": 0}


def ensure_partner_for_project(data, cursor):
    explicit_id = data.get("partner_id")
    if explicit_id:
        try:
            partner_id = int(explicit_id)
        except (TypeError, ValueError):
            partner_id = 0
        if partner_id:
            master = cursor.execute("SELECT * FROM partners WHERE id = ? AND is_active = 1", (partner_id,)).fetchone()
            if master:
                # Only absent snapshot keys inherit master values; explicit
                # empty strings remain intentional project-local overrides.
                for field in ("contact_name", "phone", "zipcode", "address", "detail_address"):
                    if field not in data:
                        data[field] = master[field] or ""
    partner_fields = _validated_partner_fields({
        "name": data.get("client_name"), "partner_type": data.get("partner_type", "미분류"),
        "contact_name": data.get("contact_name", ""), "phone": data.get("phone", ""),
        "zipcode": data.get("zipcode", ""), "address": data.get("address", ""),
        "detail_address": data.get("detail_address", ""), "memo": data.get("memo", ""),
    })
    if explicit_id:
        try:
            partner_id = int(explicit_id)
        except (TypeError, ValueError):
            partner_id = 0
        if partner_id:
            row = cursor.execute("SELECT id FROM partners WHERE id = ? AND is_active = 1", (partner_id,)).fetchone()
            if row:
                return row[0]
    name = partner_fields["name"]
    if not name:
        return None
    rows = cursor.execute("SELECT id, name FROM partners WHERE is_active = 1 ORDER BY id").fetchall()
    key = name.casefold()
    existing = next((row for row in rows if normalize_partner_name(row["name"]).casefold() == key), None)
    if existing and str(data.get("allow_duplicate_partner") or "") != "1":
        return existing[0]
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute("""INSERT INTO partners (name, partner_type, contact_name, phone, zipcode, address, detail_address, memo, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)""", (partner_fields["name"], partner_fields["partner_type"], partner_fields["contact_name"], partner_fields["phone"], partner_fields["zipcode"], partner_fields["address"], partner_fields["detail_address"], partner_fields["memo"], now, now))
    return cursor.lastrowid

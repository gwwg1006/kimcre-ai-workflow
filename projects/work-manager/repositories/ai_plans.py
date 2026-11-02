import json

from db import get_db_connection


def insert_plan(plan):
    conn = get_db_connection()
    try:
        conn.execute(
            """INSERT INTO ai_plans
            (id, scope, project_no, status, proposal_json, expected_fingerprints_json,
             staged_files_json, result_json, created_at, expires_at, applied_at, updated_at, confirmation_token_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                plan["id"], plan["scope"], plan.get("project_no"), plan["status"],
                json.dumps(plan["proposal"], ensure_ascii=False, sort_keys=True),
                json.dumps(plan["expected_fingerprints"], ensure_ascii=False, sort_keys=True),
                json.dumps(plan["staged_files"], ensure_ascii=False, sort_keys=True),
                json.dumps(plan["result"], ensure_ascii=False, sort_keys=True) if plan.get("result") is not None else None,
                plan["created_at"], plan["expires_at"], plan.get("applied_at"), plan["updated_at"], plan.get("confirmation_token_hash"),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def get_plan(plan_id):
    conn = get_db_connection()
    try:
        row = conn.execute("SELECT * FROM ai_plans WHERE id = ?", (plan_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def list_expired_pending_plans(now_text):
    conn = get_db_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM ai_plans WHERE status = 'pending' AND expires_at <= ?",
            (now_text,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def expire_pending_plans(now_text):
    """Atomically mark only still-pending expired plans and return their ids."""
    conn = get_db_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        rows = conn.execute(
            "SELECT id FROM ai_plans WHERE status = 'pending' AND expires_at <= ?",
            (now_text,),
        ).fetchall()
        ids = [row["id"] for row in rows]
        for plan_id in ids:
            conn.execute(
                "UPDATE ai_plans SET status = 'expired', updated_at = ? "
                "WHERE id = ? AND status = 'pending' AND expires_at <= ?",
                (now_text, plan_id, now_text),
            )
        conn.commit()
        return ids
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def update_plan_status(plan_id, status, updated_at, result=None, applied_at=None,
                       expected_status=None, expected_statuses=None, preserve_result=False):
    """CAS status update; return whether it won and the latest row."""
    if expected_status is not None and expected_statuses is not None:
        raise ValueError("expected_status와 expected_statuses를 함께 사용할 수 없습니다.")
    allowed = ([expected_status] if expected_status is not None else
               list(expected_statuses) if expected_statuses is not None else None)
    conn = get_db_connection()
    try:
        if preserve_result and result is None:
            result_json = conn.execute("SELECT result_json FROM ai_plans WHERE id = ?", (plan_id,)).fetchone()
            result_json = result_json[0] if result_json else None
        else:
            result_json = json.dumps(result, ensure_ascii=False, sort_keys=True) if result is not None else None
        sql = "UPDATE ai_plans SET status = ?, result_json = ?, applied_at = ?, updated_at = ? WHERE id = ?"
        params = [status, result_json, applied_at, updated_at, plan_id]
        if allowed:
            sql += " AND status IN (" + ",".join("?" for _ in allowed) + ")"
            params.extend(allowed)
        cursor = conn.execute(sql, params)
        latest = conn.execute("SELECT * FROM ai_plans WHERE id = ?", (plan_id,)).fetchone()
        conn.commit()
        return {"updated": cursor.rowcount == 1, "row": dict(latest) if latest else None}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def merge_plan_result(plan_id, patch, expected_statuses=None, updated_at=None):
    """Merge a warning/result patch without overwriting a concurrent status."""
    conn = get_db_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM ai_plans WHERE id = ?", (plan_id,)).fetchone()
        if not row:
            conn.commit()
            return {"updated": False, "row": None}
        row = dict(row)
        if expected_statuses and row["status"] not in set(expected_statuses):
            conn.commit()
            return {"updated": False, "row": row}
        current = json.loads(row["result_json"]) if row["result_json"] else {}
        if not isinstance(current, dict):
            current = {"value": current}
        current.update(patch or {})
        cursor = conn.execute(
            "UPDATE ai_plans SET result_json = ?, updated_at = ? WHERE id = ? AND status = ?",
            (json.dumps(current, ensure_ascii=False, sort_keys=True), updated_at or row["updated_at"], plan_id, row["status"]),
        )
        conn.commit()
        latest = conn.execute("SELECT * FROM ai_plans WHERE id = ?", (plan_id,)).fetchone()
        return {"updated": cursor.rowcount == 1, "row": dict(latest) if latest else None}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def claim_plan(plan_id, now_text, stale_before=None):
    """Atomically claim one live pending plan, or report its terminal state."""
    conn = get_db_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM ai_plans WHERE id = ?", (plan_id,)).fetchone()
        if not row:
            conn.commit()
            return None
        row = dict(row)
        if row["status"] == "pending" and row["expires_at"] <= now_text:
            conn.execute("UPDATE ai_plans SET status = 'expired', updated_at = ? WHERE id = ?", (now_text, plan_id))
            conn.commit()
            row["status"] = "expired"
            row["updated_at"] = now_text
            return {"claimed": False, "status": "expired", "plan": row}
        if row["status"] == "pending" and row["expires_at"] > now_text:
            cursor = conn.execute(
                "UPDATE ai_plans SET status = 'applying', updated_at = ? WHERE id = ? AND status = 'pending' AND expires_at > ?",
                (now_text, plan_id, now_text),
            )
            conn.commit()
            if cursor.rowcount == 1:
                row["status"] = "applying"
                row["updated_at"] = now_text
                return {"claimed": True, "status": "applying", "plan": row}
        # A filesystem lock timeout is safe to retry only while the plan is
        # still live.  An expired retryable plan is terminal and can be swept.
        if row["status"] == "failed" and row.get("result_json"):
            try:
                retry_result = json.loads(row["result_json"])
                retryable = (isinstance(retry_result, dict) and
                             retry_result.get("retryable") is True and
                             retry_result.get("code") == "project_busy")
            except (TypeError, ValueError, AttributeError):
                retryable = False
            if retryable:
                if row["expires_at"] <= now_text:
                    cursor = conn.execute(
                        "UPDATE ai_plans SET status = 'expired', updated_at = ?, applied_at = NULL "
                        "WHERE id = ? AND status = 'failed' AND expires_at <= ?",
                        (now_text, plan_id, now_text),
                    )
                    conn.commit()
                    if cursor.rowcount == 1:
                        row["status"] = "expired"
                        row["updated_at"] = now_text
                        return {"claimed": False, "status": "expired", "plan": row}
                cursor = conn.execute(
                    "UPDATE ai_plans SET status = 'applying', updated_at = ? " 
                    "WHERE id = ? AND status = 'failed'",
                    (now_text, plan_id),
                )
                conn.commit()
                if cursor.rowcount == 1:
                    row["status"] = "applying"
                    row["updated_at"] = now_text
                    return {"claimed": True, "status": "applying", "plan": row}
        if row["status"] == "applying" and stale_before and row.get("updated_at", "") <= stale_before:
            result = json.dumps({"code": "apply_interrupted_recovery_required"}, ensure_ascii=False)
            cursor = conn.execute(
                "UPDATE ai_plans SET status = 'failed', result_json = ?, updated_at = ? "
                "WHERE id = ? AND status = 'applying' AND updated_at <= ?",
                (result, now_text, plan_id, stale_before),
            )
            conn.commit()
            if cursor.rowcount == 1:
                row["status"] = "failed"
                row["result_json"] = result
                row["updated_at"] = now_text
                return {"claimed": False, "status": "failed", "plan": row}
        conn.commit()
        return {"claimed": False, "status": row["status"], "plan": row}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def expire_retryable_failed_plans(now_text):
    """Expire only live-checked project_busy failures whose TTL elapsed."""
    conn = get_db_connection()
    try:
        conn.execute("BEGIN IMMEDIATE")
        rows = conn.execute(
            "SELECT id, result_json FROM ai_plans WHERE status = 'failed' AND expires_at <= ?",
            (now_text,),
        ).fetchall()
        ids = []
        for row in rows:
            try:
                result = json.loads(row["result_json"] or "{}")
            except (TypeError, ValueError):
                result = {}
            if not (isinstance(result, dict) and result.get("retryable") is True and result.get("code") == "project_busy"):
                continue
            cursor = conn.execute(
                "UPDATE ai_plans SET status = 'expired', updated_at = ?, applied_at = NULL "
                "WHERE id = ? AND status = 'failed' AND expires_at <= ?",
                (now_text, row["id"], now_text),
            )
            if cursor.rowcount == 1:
                ids.append(row["id"])
        conn.commit()
        return ids
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

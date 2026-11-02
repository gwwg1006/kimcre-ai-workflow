import json
import os
import secrets
from datetime import datetime, timedelta, timezone

from db import get_db_connection

LEASE_SECONDS = 120
MAX_ATTEMPTS = 5
HEARTBEAT_BUSY_TIMEOUT_MS = 250

def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")

def claim_next(project_no=None, owner=None, lease_seconds=LEASE_SECONDS):
    """Atomically claim one pending or expired processing job and return its lease token."""
    conn = get_db_connection()
    try:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        now_text = now.strftime("%Y-%m-%d %H:%M:%S")
        expiry = (now + timedelta(seconds=int(lease_seconds))).strftime("%Y-%m-%d %H:%M:%S")
        token = secrets.token_urlsafe(24)
        conn.execute("BEGIN IMMEDIATE")
        params = [now_text]
        # A worker that died on its final attempt must not remain processing forever.
        conn.execute("UPDATE sync_jobs SET status='failed', last_error='attempt_limit', lease_token=NULL, lease_owner=NULL, lease_expires_at=NULL, updated_at=? WHERE status='processing' AND lease_expires_at IS NOT NULL AND lease_expires_at < ? AND attempts >= ?", (now_text, now_text, MAX_ATTEMPTS))
        where = "(status = 'pending' OR (status = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at < ?)) AND attempts < ?"
        params.append(MAX_ATTEMPTS)
        if project_no:
            where += " AND project_no = ?"; params.extend([project_no])
        row = conn.execute(f"SELECT id FROM sync_jobs WHERE {where} ORDER BY created_at, id LIMIT 1", params).fetchone()
        if not row:
            conn.commit(); return None
        cursor = conn.execute("UPDATE sync_jobs SET status='processing', attempts=attempts+1, lease_token=?, lease_owner=?, lease_expires_at=?, updated_at=? WHERE id=? AND (status='pending' OR (status='processing' AND lease_expires_at < ?)) AND attempts < ?", (token, owner or str(os.getpid()), expiry, now_text, row[0], now_text, MAX_ATTEMPTS))
        if cursor.rowcount != 1:
            conn.rollback(); return None
        claimed = conn.execute("SELECT * FROM sync_jobs WHERE id=?", (row[0],)).fetchone()
        conn.commit(); return dict(claimed)
    except Exception:
        conn.rollback(); raise
    finally:
        conn.close()


def enqueue_job(operation, project_no, payload=None, conn=None):
    own = conn is None
    connection = conn or get_db_connection()
    try:
        now = _now()
        payload_json = json.dumps(payload or {}, ensure_ascii=False, sort_keys=True)
        row = connection.execute(
            "SELECT id FROM sync_jobs WHERE project_no = ? AND operation = ? AND status IN ('pending','failed') ORDER BY id LIMIT 1",
            (project_no, operation),
        ).fetchone()
        if row:
            connection.execute("UPDATE sync_jobs SET payload_json = ?, status = CASE WHEN status='failed' THEN 'pending' ELSE status END, attempts = CASE WHEN status='failed' THEN 0 ELSE attempts END, last_error = CASE WHEN status='failed' THEN NULL ELSE last_error END, updated_at = ? WHERE id = ?", (payload_json, now, row[0]))
            job_id = row[0]
        else:
            cursor = connection.execute(
                "INSERT INTO sync_jobs(operation, project_no, payload_json, status, attempts, created_at, updated_at) VALUES (?, ?, ?, 'pending', 0, ?, ?)",
                (operation, project_no, payload_json, now, now),
            )
            job_id = cursor.lastrowid
        if own:
            connection.commit()
        return job_id
    except Exception:
        if own:
            connection.rollback()
        raise
    finally:
        if own:
            connection.close()


def list_pending(limit=20, stale_before=None, project_no=None):
    conn = get_db_connection()
    try:
        # Keep the compatibility argument, but reclaim only by the lease clock.
        now = _now()
        conn.execute("UPDATE sync_jobs SET status='failed', last_error='attempt_limit', lease_token=NULL, lease_owner=NULL, lease_expires_at=NULL, updated_at=? WHERE status='processing' AND lease_expires_at IS NOT NULL AND lease_expires_at < ? AND attempts >= ?", (now, now, MAX_ATTEMPTS))
        conn.execute("UPDATE sync_jobs SET status='pending', lease_token=NULL, lease_owner=NULL, lease_expires_at=NULL, updated_at=? WHERE status='processing' AND lease_expires_at IS NOT NULL AND lease_expires_at < ? AND attempts < ?", (now, now, MAX_ATTEMPTS))
        conn.commit()
        if project_no:
            rows = conn.execute("SELECT * FROM sync_jobs WHERE project_no=? AND status IN ('pending','failed') AND attempts < ? ORDER BY id LIMIT ?", (project_no, MAX_ATTEMPTS, int(limit))).fetchall()
        else:
            rows = conn.execute("SELECT * FROM sync_jobs WHERE status IN ('pending','failed') AND attempts < ? ORDER BY id LIMIT ?", (MAX_ATTEMPTS, int(limit))).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def mark_processing(job_id):
    conn = get_db_connection()
    try:
        token = secrets.token_urlsafe(24)
        now = _now()
        expiry = (datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=LEASE_SECONDS)).strftime("%Y-%m-%d %H:%M:%S")
        cursor = conn.execute("UPDATE sync_jobs SET status='processing', attempts=attempts+1, lease_token=?, lease_owner=?, lease_expires_at=?, updated_at=? WHERE id=? AND status IN ('pending','failed') AND attempts < ?", (token, str(os.getpid()), expiry, now, job_id, MAX_ATTEMPTS))
        conn.commit()
        return cursor.rowcount == 1
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def mark_done(job_id, lease_token=None):
    conn = get_db_connection()
    try:
        if not lease_token: return False
        where = "id=? AND status='processing' AND lease_token=?"; params = [_now(), job_id, lease_token]
        cursor = conn.execute(f"UPDATE sync_jobs SET status='done', lease_token=NULL, lease_owner=NULL, lease_expires_at=NULL, updated_at=? WHERE {where}", params)
        conn.commit()
        return cursor.rowcount == 1
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def mark_failed(job_id, error, lease_token=None):
    conn = get_db_connection()
    try:
        safe_code = str(error) if str(error) in {"projection_failed", "projection_not_found", "unsupported_operation", "attempt_limit", "projection_lock_timeout", "lease_lost"} else "projection_failed"
        if not lease_token: return False
        params = [safe_code, _now(), job_id, lease_token]; where = "id=? AND status='processing' AND lease_token=?"
        cursor = conn.execute(f"UPDATE sync_jobs SET status='failed', last_error=?, lease_token=NULL, lease_owner=NULL, lease_expires_at=NULL, updated_at=? WHERE {where}", params)
        conn.commit()
        return cursor.rowcount == 1
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def heartbeat(job_id, lease_token, lease_seconds=LEASE_SECONDS):
    conn = get_db_connection()
    try:
        # Heartbeat must not remain blocked behind a long writer transaction;
        # the caller can then stop/join the worker thread deterministically.
        conn.execute(f"PRAGMA busy_timeout = {HEARTBEAT_BUSY_TIMEOUT_MS}")
        expiry = (datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=int(lease_seconds))).strftime("%Y-%m-%d %H:%M:%S")
        cursor = conn.execute("UPDATE sync_jobs SET lease_expires_at=?, updated_at=? WHERE id=? AND status='processing' AND lease_token=?", (expiry, _now(), job_id, lease_token))
        conn.commit()
        return cursor.rowcount == 1
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def reset_failed_jobs(project_no=None):
    conn = get_db_connection()
    try:
        if project_no:
            cursor = conn.execute("UPDATE sync_jobs SET status='pending', attempts=0, last_error=NULL, updated_at=? WHERE status='failed' AND project_no=?", (_now(), project_no))
        else:
            cursor = conn.execute("UPDATE sync_jobs SET status='pending', attempts=0, last_error=NULL, updated_at=? WHERE status='failed'", (_now(),))
        conn.commit()
        return cursor.rowcount
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def count_open_jobs(project_no=None):
    conn = get_db_connection()
    try:
        if project_no:
            return conn.execute("SELECT COUNT(*) FROM sync_jobs WHERE project_no=? AND status IN ('pending','processing','failed') AND attempts < ?", (project_no, MAX_ATTEMPTS)).fetchone()[0]
        return conn.execute("SELECT COUNT(*) FROM sync_jobs WHERE status IN ('pending','processing','failed') AND attempts < ?", (MAX_ATTEMPTS,)).fetchone()[0]
    finally:
        conn.close()

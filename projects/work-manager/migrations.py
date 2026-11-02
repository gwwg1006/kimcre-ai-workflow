from config import DEFAULT_COURIER
from db import get_db_connection
from repositories.partners import migrate_projects_to_partners


def init_db():
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""CREATE TABLE IF NOT EXISTS projects (
        project_no TEXT PRIMARY KEY, received_date TEXT, client_name TEXT NOT NULL, job_name TEXT NOT NULL,
        channel TEXT DEFAULT '카카오톡', material TEXT, color TEXT, quantity TEXT DEFAULT '1', quote_amount INTEGER DEFAULT 0,
        shipping_fee INTEGER DEFAULT 3500, model_fee INTEGER DEFAULT 0, post_process_fee INTEGER DEFAULT 0, tax_type TEXT DEFAULT '면세',
        total_amount INTEGER DEFAULT 0, paid_amount INTEGER DEFAULT 0, unpaid_amount INTEGER DEFAULT 0, prod_status TEXT DEFAULT '접수',
        pay_status TEXT DEFAULT '미청구', deliv_status TEXT DEFAULT '예약 필요', overall_status TEXT DEFAULT '진행 중', due_date TEXT,
        project_path TEXT, original_files TEXT, slicing_file TEXT, tracking_no TEXT, courier TEXT, partner_id INTEGER, contact_name TEXT,
        tracking_status_text TEXT, tracking_latest_date TEXT, tracking_latest_time TEXT, tracking_latest_location TEXT,
        tracking_checked_at TEXT, phone TEXT, address TEXT, detail_address TEXT, zipcode TEXT, box_type TEXT DEFAULT 'A', memo TEXT,
        request_notes TEXT, created_at TEXT, updated_at TEXT,
        version INTEGER NOT NULL DEFAULT 1)""")
        cursor.execute("""CREATE TABLE IF NOT EXISTS partners (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, partner_type TEXT DEFAULT '미분류', contact_name TEXT DEFAULT '',
        phone TEXT DEFAULT '', zipcode TEXT DEFAULT '', address TEXT DEFAULT '', detail_address TEXT DEFAULT '', memo TEXT DEFAULT '',
        is_active INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT)""")
        cursor.execute("PRAGMA table_info(projects)")
        columns = {row[1] for row in cursor.fetchall()}
        for column, kind in {
        "partner_id": "INTEGER", "contact_name": "TEXT", "tracking_status_text": "TEXT", "tracking_latest_date": "TEXT",
        "tracking_latest_time": "TEXT", "tracking_latest_location": "TEXT", "tracking_checked_at": "TEXT",
    }.items():
            if column not in columns:
                cursor.execute(f"ALTER TABLE projects ADD COLUMN {column} {kind}")
        if "version" not in columns:
            cursor.execute("ALTER TABLE projects ADD COLUMN version INTEGER NOT NULL DEFAULT 1")
        cursor.execute("UPDATE projects SET version = 1 WHERE version IS NULL OR version < 1")
        cursor.execute("""CREATE TABLE IF NOT EXISTS project_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, project_no TEXT NOT NULL, seq INTEGER DEFAULT 1, name TEXT,
        original_stl TEXT, quantity INTEGER DEFAULT 1, material TEXT, color TEXT, layer_height REAL DEFAULT 0.2,
        wall_count INTEGER DEFAULT 3, infill_rate REAL DEFAULT 0.2, unit_price INTEGER DEFAULT 0,
        status TEXT DEFAULT '대기', note TEXT, FOREIGN KEY (project_no) REFERENCES projects(project_no) ON DELETE CASCADE)""")
        cursor.execute("""CREATE TABLE IF NOT EXISTS ai_plans (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL CHECK (scope IN ('project', 'global')),
        project_no TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'applying', 'applied', 'cancelled', 'expired', 'failed')),
        proposal_json TEXT NOT NULL,
        expected_fingerprints_json TEXT NOT NULL,
        staged_files_json TEXT NOT NULL,
        result_json TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        applied_at TEXT,
        updated_at TEXT NOT NULL
    )""")
        cursor.execute("PRAGMA table_info(ai_plans)")
        ai_plan_columns = {row[1] for row in cursor.fetchall()}
        if "confirmation_token_hash" not in ai_plan_columns:
            cursor.execute("ALTER TABLE ai_plans ADD COLUMN confirmation_token_hash TEXT")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ai_plans_status_expires ON ai_plans(status, expires_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ai_plans_project_status ON ai_plans(project_no, status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ai_plans_updated ON ai_plans(updated_at)")
        cursor.execute("""CREATE TABLE IF NOT EXISTS sync_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
            project_no TEXT NOT NULL,
            payload_json TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )""")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sync_jobs_pending ON sync_jobs(status, updated_at)")
        cursor.execute("PRAGMA table_info(sync_jobs)")
        sync_columns = {row[1] for row in cursor.fetchall()}
        if "lease_token" not in sync_columns:
            cursor.execute("ALTER TABLE sync_jobs ADD COLUMN lease_token TEXT")
        if "lease_owner" not in sync_columns:
            cursor.execute("ALTER TABLE sync_jobs ADD COLUMN lease_owner TEXT")
        if "lease_expires_at" not in sync_columns:
            cursor.execute("ALTER TABLE sync_jobs ADD COLUMN lease_expires_at TEXT")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sync_jobs_lease ON sync_jobs(status, lease_expires_at)")
        # Lease timestamps introduced here are UTC-naive strings. Legacy jobs
        # without a lease are safely requeued; existing non-NULL leases are
        # never reset at startup because they are already in the new contract.
        cursor.execute("UPDATE sync_jobs SET status='pending', lease_token=NULL, lease_owner=NULL, lease_expires_at=NULL WHERE status='processing' AND lease_expires_at IS NULL")
        cursor.execute("UPDATE projects SET deliv_status = '예약 필요' WHERE deliv_status = '미정' OR deliv_status IS NULL")
        cursor.execute("UPDATE projects SET courier = ? WHERE courier IS NULL OR TRIM(courier) = ''", (DEFAULT_COURIER,))
        # Exact legacy label only; IDs, links, snapshots and archive flags stay untouched.
        cursor.execute("UPDATE partners SET partner_type = '미분류' WHERE partner_type = '업체/개인'")
        migrate_projects_to_partners(cursor)
        # Diagnostic only: never delete or repair legacy orphan rows here.
        cursor.execute("PRAGMA foreign_key_check")
        cursor.fetchall()
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

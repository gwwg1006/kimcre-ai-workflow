"""기존 database import 호환을 위한 얇은 facade."""
from db import DB_PATH, get_db_connection
from migrations import init_db
from repositories.partners import (
    normalize_partner_name, find_partner_by_name, get_partner_by_id, list_partners,
    create_partner, update_partner, archive_partner, ensure_partner_for_project,
    migrate_projects_to_partners,
)
from repositories.projects import get_project_by_no, get_all_projects, get_dashboard_stats
from sync_service import (
    parse_markdown_info, parse_quotation_excel,
    sync_from_filesystem_and_excel, sync_project_to_excel_ledger,
)
from project_service import (
    generate_next_project_no, calculate_amounts, create_project_in_db_and_fs,
    update_project_in_db, update_status, delete_project_from_db_and_fs, ProjectConflictError,
)

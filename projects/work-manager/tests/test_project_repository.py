import importlib
import tempfile
import unittest
from pathlib import Path


class ProjectRepositoryTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        db = importlib.import_module("db")
        self.addCleanup(setattr, db, "DB_PATH", db.DB_PATH)
        db.DB_PATH = str(Path(self.temp_dir.name) / "projects.db")
        self.db = db
        importlib.import_module("migrations").init_db()
        self.repo = importlib.import_module("repositories.projects")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_detail_includes_items(self):
        conn = self.db.get_db_connection()
        conn.execute("INSERT INTO projects (project_no, client_name, job_name, total_amount) VALUES (?, ?, ?, ?)", ("P-001", "고객", "작업", 1000))
        conn.execute("INSERT INTO project_items (project_no, seq, name, quantity) VALUES (?, ?, ?, ?)", ("P-001", 1, "부품", 2))
        conn.commit(); conn.close()
        detail = self.repo.get_project_by_no("P-001")
        self.assertEqual(detail["items"][0]["name"], "부품")
        self.assertIsNone(self.repo.get_project_by_no("missing"))

    def test_search_and_list_filters(self):
        conn = self.db.get_db_connection()
        rows = [
            ("P-001", "Acme", "One", "접수", "입금 대기", "예약 필요", "진행 중"),
            ("P-002", "Other", "Two", "출력 중", "입금 완료", "발송", "진행 중"),
        ]
        for row in rows:
            conn.execute("INSERT INTO projects (project_no, client_name, job_name, prod_status, pay_status, deliv_status, overall_status) VALUES (?, ?, ?, ?, ?, ?, ?)", row)
        conn.commit(); conn.close()
        self.assertEqual(self.repo.get_all_projects({"search": "Acme"})[0]["project_no"], "P-001")
        filtered = self.repo.get_all_projects({"prod_status": ["출력 중"], "pay_status": ["입금 완료"]})
        self.assertEqual([row["project_no"] for row in filtered], ["P-002"])
        self.assertEqual(len(self.repo.get_all_projects()), 2)

    def test_dashboard_stats_keys_and_values(self):
        conn = self.db.get_db_connection()
        conn.execute("INSERT INTO projects (project_no, client_name, job_name, total_amount, paid_amount, unpaid_amount, prod_status, pay_status, deliv_status, overall_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ("P-001", "A", "A", 1000, 400, 600, "접수", "입금 대기", "예약 필요", "진행 중"))
        conn.execute("INSERT INTO projects (project_no, client_name, job_name, total_amount, paid_amount, unpaid_amount, prod_status, pay_status, deliv_status, overall_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", ("P-002", "B", "B", 2000, 2000, 0, "출력 중", "입금 완료", "배송 완료", "완료"))
        conn.commit(); conn.close()
        stats = self.repo.get_dashboard_stats()
        self.assertEqual(stats["total_count"], 2)
        self.assertEqual(stats["in_progress"], 1)
        self.assertEqual(stats["waiting_print"], 1)
        self.assertEqual(stats["printing"], 1)
        self.assertEqual(stats["deliv_needed"], 1)
        self.assertEqual(stats["pay_pending"], 1)
        self.assertEqual(stats["completed"], 1)
        self.assertEqual(stats["total_sales"], 3000)
        self.assertEqual(stats["total_paid"], 2400)
        self.assertEqual(stats["total_unpaid"], 600)

    def test_database_reexports_project_read_repository(self):
        database = importlib.import_module("database")
        self.assertIs(database.get_project_by_no, self.repo.get_project_by_no)
        self.assertIs(database.get_all_projects, self.repo.get_all_projects)
        self.assertIs(database.get_dashboard_stats, self.repo.get_dashboard_stats)


if __name__ == "__main__":
    unittest.main()

import importlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import openpyxl


class SyncServiceTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.db = importlib.import_module("db")
        self.addCleanup(setattr, self.db, "DB_PATH", self.db.DB_PATH)
        self.db.DB_PATH = str(root / "app.db")
        self.sync = importlib.import_module("sync_service")
        self.projects_dir = root / "projects"
        self.projects_dir.mkdir()
        self.operations = root / "operations.xlsx"
        importlib.import_module("migrations").init_db()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_markdown_parser(self):
        path = Path(self.temp_dir.name) / "작업정보.md"
        path.write_text("- 고객명: 테스트 고객\n- 배송비: 3,500원\n메모\n", encoding="utf-8")
        self.assertEqual(self.sync.parse_markdown_info(str(path)), {"고객명": "테스트 고객", "배송비": "3,500원"})
        self.assertEqual(self.sync.parse_markdown_info(str(path.with_name("missing.md"))), {})

    def test_markdown_amount_parser_is_strict(self):
        self.assertEqual(self.sync.parse_markdown_amount("1,234원"), 1234)
        self.assertEqual(self.sync.parse_markdown_amount(" 1234 원 "), 1234)
        self.assertIsNone(self.sync.parse_markdown_amount("-1,000원"))
        self.assertIsNone(self.sync.parse_markdown_amount("세금 1,000원 / 합계 2,000원"))
        self.assertEqual(self.sync.parse_markdown_amount("", default=3500), 3500)

    def test_quotation_parser_reads_items_shipping_and_tax(self):
        path = Path(self.temp_dir.name) / "견적서.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "통합견적서"
        ws.cell(1, 5, "품명")
        ws.cell(2, 5, "부품 A")
        ws.cell(2, 10, 2)
        ws.cell(2, 13, "PETG")
        ws.cell(2, 17, "White")
        ws.cell(2, 25, 1200)
        ws.cell(3, 5, "배송비")
        ws.cell(3, 25, 4000)
        ws.cell(4, 5, "부가세 과세")
        wb.save(path)
        wb.close()
        result = self.sync.parse_quotation_excel(str(path))
        self.assertEqual(result["items"][0]["name"], "부품 A")
        self.assertEqual(result["items"][0]["quantity"], 2)
        self.assertEqual(result["shipping_fee"], 4000)
        self.assertEqual(result["tax_type"], "과세")
        self.assertEqual(result["subtotal"], 2400)

    def test_filesystem_sync_creates_project_and_items_in_temp_db(self):
        project = self.projects_dir / "2026" / "260824-001_고객_작업"
        (project / "00_작업정보").mkdir(parents=True)
        (project / "05_견적거래").mkdir()
        (project / "00_작업정보" / "작업정보.md").write_text(
            "- 접수일: 2026-08-24\n- 고객명: 고객\n- 작업명: 작업\n- 견적금액: 12000원\n"
            "- 배송비: 3500원\n- 소재: PETG\n- 색상: White\n- 제작상태: 접수\n",
            encoding="utf-8",
        )
        with patch.object(self.sync, "PROJECTS_DIR", str(self.projects_dir)), patch.object(self.sync, "OPERATIONS_FILE", str(self.operations)):
            self.sync.sync_from_filesystem_and_excel()
        conn = self.db.get_db_connection()
        row = conn.execute("SELECT client_name, quote_amount, shipping_fee, courier, deliv_status FROM projects WHERE project_no = ?", ("260824-001",)).fetchone()
        self.assertEqual(dict(row), {
            "client_name": "고객",
            "quote_amount": 12000,
            "shipping_fee": 3500,
            "courier": "한진택배",
            "deliv_status": "예약 필요",
        })
        self.assertIsNotNone(conn.execute("SELECT id FROM partners WHERE name = ?", ("고객",)).fetchone())
        conn.close()

    def test_tax_paid_excel_sync_sets_total_paid_and_zero_unpaid(self):
        project = self.projects_dir / "2026" / "260824-003_과세고객_과세작업"
        (project / "00_작업정보").mkdir(parents=True)
        quote_path = project / "05_견적거래" / "견적서.xlsx"
        quote_path.parent.mkdir()
        quote_wb = openpyxl.Workbook()
        quote_ws = quote_wb.active
        quote_ws.title = "견적서"
        quote_ws.cell(1, 5, "품명")
        quote_ws.cell(2, 5, "과세 부품")
        quote_ws.cell(2, 10, 1)
        quote_ws.cell(2, 13, "PETG")
        quote_ws.cell(2, 17, "White")
        quote_ws.cell(2, 25, 10000)
        quote_ws.cell(3, 5, "부가세 과세")
        quote_wb.save(quote_path)
        quote_wb.close()

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "작업대장"
        headers = ["프로젝트번호", "고객명", "작업명", "결제상태", "배송비"]
        for col, value in enumerate(headers, 1):
            ws.cell(1, col, value)
        ws.append(["260824-003", "과세고객", "과세작업", "입금 완료", 3500])
        wb.save(self.operations)
        wb.close()

        with patch.object(self.sync, "PROJECTS_DIR", str(self.projects_dir)), patch.object(self.sync, "OPERATIONS_FILE", str(self.operations)):
            self.sync.sync_from_filesystem_and_excel()

        conn = self.db.get_db_connection()
        row = conn.execute(
            "SELECT total_amount, paid_amount, unpaid_amount, tax_type FROM projects WHERE project_no = ?",
            ("260824-003",),
        ).fetchone()
        self.assertEqual(dict(row), {
            "total_amount": 14850,
            "paid_amount": 14850,
            "unpaid_amount": 0,
            "tax_type": "과세",
        })
        conn.close()

    def _create_ledger(self):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "작업대장"
        headers = ["프로젝트번호", "접수일", "고객명", "작업명", "견적금액", "배송비", "제작상태"]
        for col, value in enumerate(headers, 1):
            ws.cell(1, col, value)
        wb.save(self.operations)
        wb.close()

    def test_ledger_appends_and_updates_project_row(self):
        self._create_ledger()
        conn = self.db.get_db_connection()
        conn.execute(
            "INSERT INTO projects (project_no, received_date, client_name, job_name, quote_amount, shipping_fee, prod_status) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("260824-002", "2026-08-24", "거래처", "출력", 10000, 3500, "접수"),
        )
        conn.commit()
        conn.close()
        with patch.object(self.sync, "OPERATIONS_FILE", str(self.operations)):
            self.sync.sync_project_to_excel_ledger("260824-002")
        wb = openpyxl.load_workbook(self.operations, data_only=True)
        ws = wb["작업대장"]
        self.assertEqual(ws.cell(2, 1).value, "260824-002")
        self.assertEqual(ws.cell(2, 5).value, 10000)
        wb.close()

        conn = self.db.get_db_connection()
        conn.execute("UPDATE projects SET client_name = ? WHERE project_no = ?", ("수정 거래처", "260824-002"))
        conn.commit()
        conn.close()
        with patch.object(self.sync, "OPERATIONS_FILE", str(self.operations)):
            self.sync.sync_project_to_excel_ledger("260824-002")
        wb = openpyxl.load_workbook(self.operations, data_only=True)
        self.assertEqual(wb["작업대장"].cell(2, 3).value, "수정 거래처")
        wb.close()

    def test_database_reexports_sync_functions(self):
        database = importlib.import_module("database")
        self.assertIs(database.parse_markdown_info, self.sync.parse_markdown_info)
        self.assertIs(database.parse_quotation_excel, self.sync.parse_quotation_excel)
        self.assertIs(database.sync_from_filesystem_and_excel, self.sync.sync_from_filesystem_and_excel)
        self.assertIs(database.sync_project_to_excel_ledger, self.sync.sync_project_to_excel_ledger)


if __name__ == "__main__":
    unittest.main()

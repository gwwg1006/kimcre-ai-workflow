import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]


class PartnerProjectE2ETest(unittest.TestCase):
    def test_partner_project_delivery_shape_in_isolated_http_app(self):
        with tempfile.TemporaryDirectory() as root:
            root_path = Path(root)
            env = os.environ.copy()
            env.update({
                "KMC_E2E_MODE": "1",
                "KMC_BASE_DIR": root,
                "KMC_PROJECTS_DIR": str(root_path / "10_프로젝트"),
                "KMC_COMPLETED_DIR": str(root_path / "20_완료"),
                "KMC_OPERATIONS_FILE": str(root_path / "00_운영" / "ops.xlsx"),
                "KMC_DATA_DIR": str(root_path / "data"),
                "KMC_DB_PATH": str(root_path / "data" / "app.db"),
                "KMC_DISABLE_EXTERNAL_SERVICES": "1",
                "STARTUP_SYNC": "0",
            })
            script = textwrap.dedent(
                """
                import sqlite3
                from app import app
                import db
                from repositories.partners import migrate_projects_to_partners

                client = app.test_client()
                created = client.post('/api/partners', json={
                    'name': '통합 거래처', 'contact_name': '담당자', 'phone': '010-1111-2222',
                    'zipcode': '06234', 'address': '서울시 강남구', 'detail_address': '101호'
                })
                assert created.status_code == 200, created.get_data(as_text=True)
                partner = created.get_json()['data']
                duplicate = client.post('/api/partners', json={'name': '통합 거래처'})
                assert duplicate.status_code == 409
                duplicate_allowed = client.post('/api/partners', json={'name': '통합 거래처', 'allow_duplicate': True})
                assert duplicate_allowed.status_code == 200
                searched = client.get('/api/partners?search= 통합 거래처 ')
                assert len(searched.get_json()['data']) == 2

                project = client.post('/api/projects', json={
                    'project_no': '260824-901', 'client_name': '통합 거래처', 'job_name': '파트너 연동 출력',
                    'received_date': '2026-08-24', 'partner_id': partner['id'],
                    'phone': '010-1111-2222', 'zipcode': '06234', 'address': '서울시 강남구',
                    'detail_address': '101호', 'items': [{'name': '부품A', 'quantity': 2, 'unit_price': 5000, 'material': 'PLA', 'color': 'White'}]
                })
                assert project.status_code == 200, project.get_data(as_text=True)
                detail = client.get('/api/projects/260824-901')
                assert detail.status_code == 200
                snapshot = detail.get_json()['data']
                assert snapshot['partner_id'] == partner['id']
                assert snapshot['address'] == '서울시 강남구'
                assert snapshot['tabs']
                project_root = snapshot['project_path']
                assert all(__import__('os').path.isdir(__import__('os').path.join(project_root, name)) for name in (
                    '00_작업정보','01_수신원본','02_모델수정','03_슬라이싱_3MF','04_출력검수','05_견적거래','06_배송'))
                conn = db.get_db_connection()
                assert conn.execute("SELECT COUNT(*) FROM sync_jobs WHERE project_no = ?", ('260824-901',)).fetchone()[0] >= 1
                conn.close()

                updated = client.put('/api/projects/260824-901', json={
                    'phone': '010-9999-8888', 'address': '변경된 배송지', 'detail_address': '202호'
                })
                assert updated.status_code == 200, updated.get_data(as_text=True)
                master = client.get('/api/partners?search=통합 거래처').get_json()['data'][0]
                assert master['phone'] == '010-1111-2222'
                assert master['address'] == '서울시 강남구'
                assert client.get('/api/projects/260824-901').get_json()['data']['address'] == '변경된 배송지'

                archived = client.delete('/api/partners/%s' % partner['id'])
                assert archived.status_code == 200
                assert not any(item['id'] == partner['id'] for item in client.get('/api/partners').get_json()['data'])
                assert any(item['id'] == partner['id'] for item in client.get('/api/partners?include_inactive=true').get_json()['data'])
                assert client.get('/api/projects/260824-901').status_code == 200

                fresh = client.post('/api/projects', json={
                    'project_no': '260824-902', 'client_name': '통합 거래처', 'job_name': '보관 후 신규',
                    'received_date': '2026-08-24', 'phone': '010-3333-4444'
                })
                assert fresh.status_code == 200, fresh.get_data(as_text=True)
                fresh_id = client.get('/api/projects/260824-902').get_json()['data']['partner_id']
                assert fresh_id != partner['id']

                conn = db.get_db_connection()
                conn.execute("INSERT INTO projects (project_no, client_name, job_name, phone, address, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                             ('260824-903', '이관 업체', '오래된 작업', '010-old', '구주소', '2026-08-24 11:00:00'))
                conn.execute("INSERT INTO projects (project_no, client_name, job_name, phone, address, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                             ('260824-904', '이관 업체', '최신 작업', '010-new', '신주소', '2026-08-24 12:00:00'))
                conn.commit()
                migrate_projects_to_partners(conn.cursor())
                conn.commit()
                rows = conn.execute("SELECT partner_id FROM projects WHERE project_no IN ('260824-903','260824-904') ORDER BY project_no").fetchall()
                assert rows[0][0] == rows[1][0]
                migrated = conn.execute("SELECT phone, address FROM partners WHERE id = ?", (rows[0][0],)).fetchone()
                assert migrated['phone'] == '010-new' and migrated['address'] == '신주소'
                conn.close()
                print('partner_project_e2e: ok')
                """
            )
            result = subprocess.run(
                [sys.executable, "-c", script], cwd=REPO, env=env,
                text=True, capture_output=True, check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr + "\n" + result.stdout)
            self.assertIn("partner_project_e2e: ok", result.stdout)


if __name__ == "__main__":
    unittest.main()

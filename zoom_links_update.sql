-- Zoom links for the 5 teachers (same UUIDs as full_import.sql).
-- Run right after full_import.sql (safe to re-run any time).
UPDATE crm_teachers SET zoom_link = 'https://us05web.zoom.us/j/5836822550?pwd=sZyqbjn1zArUl9Vf3myFNoSaczGmRC.1', updated_at = now() WHERE id = 'b93a430a-55fe-488b-b389-acbfecaae70c'; -- هدير
UPDATE crm_teachers SET zoom_link = 'https://us05web.zoom.us/j/9772638057?pwd=34U1bQIwLbijQ4pWa8eQ4fLobTj3Er.1', updated_at = now() WHERE id = '46960444-f008-4d7c-95c3-f7727efb7b11'; -- نورهان
UPDATE crm_teachers SET zoom_link = 'https://us06web.zoom.us/j/9441664277?pwd=wzI49842y4TkLNeBKtg61lEwapqkHk.1', updated_at = now() WHERE id = '72576cc8-3f23-4480-af0c-f3fc6e58a403'; -- اسراء
UPDATE crm_teachers SET zoom_link = 'https://us05web.zoom.us/j/2966243655?pwd=7cnkedfM4CQwIMHupGkQXUzjhaIxqp.1', updated_at = now() WHERE id = 'bd2131e8-a6f3-4640-b9ee-4332ecd48e69'; -- الاء
UPDATE crm_teachers SET zoom_link = 'https://us05web.zoom.us/j/8063242518?pwd=wtT5BBZmrV6GEaf0kICv9431Wy9kX2.1', updated_at = now() WHERE id = '1d162b4c-b052-4c68-bb6b-0ed29df04aac'; -- ميمونة
SELECT id, full_name, zoom_link FROM crm_teachers ORDER BY full_name;

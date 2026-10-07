-- ============================================================
-- ATTENDANCE FIX 2026-10-08
-- The teachers' sheet totals 150 attended + 96 did not attend = 246.
-- attendance_update.sql only reached 149 + 89 because 2 repeated-name rows
-- and 6 rows with no student name ("-") were skipped.
-- This adds those 8 sessions as placeholder leads (UNKNOWN-068..075,
-- source NULL). Idempotent: skipped when the phone already exists.
-- ============================================================
BEGIN;
DO $$
DECLARE admin_id uuid;
BEGIN
  SELECT id INTO admin_id FROM users ORDER BY created_at ASC LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'No user found'; END IF;

  INSERT INTO crm_leads (id, full_name, phone, source, stage, notes, follow_up_count, is_converted, is_lost, teacher_name, lecture_time, attended, created_by, created_at, updated_at) SELECT 'f7948a59-38fe-52a7-892d-11de1f201746', 'كادي الغنام', 'UNKNOWN-068', NULL, 'attendance_recorded', 'من شيت حضور المعلمين (اسراء) - صف مكرر لنفس الاسم في شيت المعلمين (محسوب كحجز مستقل كما في إجمالي الشيت) | انقطع الاتصال أثناء المحاضرة (فصل)', 0, false, false, 'اسراء', NULL::time, true, admin_id, now(), now() WHERE NOT EXISTS (SELECT 1 FROM crm_leads WHERE phone = 'UNKNOWN-068');
  INSERT INTO crm_leads (id, full_name, phone, source, stage, notes, follow_up_count, is_converted, is_lost, teacher_name, lecture_time, attended, created_by, created_at, updated_at) SELECT '247d5f4c-cc27-5431-8eea-59a96a60332a', 'عبدالله العامر', 'UNKNOWN-069', NULL, 'attendance_recorded', 'من شيت حضور المعلمين (هدير) - صف مكرر لنفس الاسم في شيت المعلمين (محسوب كحجز مستقل كما في إجمالي الشيت)', 0, false, false, 'هدير', '20:00:00'::time, false, admin_id, now(), now() WHERE NOT EXISTS (SELECT 1 FROM crm_leads WHERE phone = 'UNKNOWN-069');
  INSERT INTO crm_leads (id, full_name, phone, source, stage, notes, follow_up_count, is_converted, is_lost, teacher_name, lecture_time, attended, created_by, created_at, updated_at) SELECT '2d6c13b9-8c89-516a-913c-53cade60963e', 'بدون اسم (حجز غير مسمّى)', 'UNKNOWN-070', NULL, 'attendance_recorded', 'من شيت حضور المعلمين (اسراء) - حجز في شيت المعلمين بدون اسم طالب (مكتوب "-")', 0, false, false, 'اسراء', '15:00:00'::time, false, admin_id, now(), now() WHERE NOT EXISTS (SELECT 1 FROM crm_leads WHERE phone = 'UNKNOWN-070');
  INSERT INTO crm_leads (id, full_name, phone, source, stage, notes, follow_up_count, is_converted, is_lost, teacher_name, lecture_time, attended, created_by, created_at, updated_at) SELECT '732b128d-41df-5ed1-97c1-cac193240e8b', 'بدون اسم (حجز غير مسمّى)', 'UNKNOWN-071', NULL, 'attendance_recorded', 'من شيت حضور المعلمين (اسراء) - حجز في شيت المعلمين بدون اسم طالب (مكتوب "-")', 0, false, false, 'اسراء', '16:30:00'::time, false, admin_id, now(), now() WHERE NOT EXISTS (SELECT 1 FROM crm_leads WHERE phone = 'UNKNOWN-071');
  INSERT INTO crm_leads (id, full_name, phone, source, stage, notes, follow_up_count, is_converted, is_lost, teacher_name, lecture_time, attended, created_by, created_at, updated_at) SELECT '1395ce21-4b36-5364-8bb7-986060f2414b', 'بدون اسم (حجز غير مسمّى)', 'UNKNOWN-072', NULL, 'attendance_recorded', 'من شيت حضور المعلمين (هدير) - حجز في شيت المعلمين بدون اسم طالب (مكتوب "-")', 0, false, false, 'هدير', '20:30:00'::time, false, admin_id, now(), now() WHERE NOT EXISTS (SELECT 1 FROM crm_leads WHERE phone = 'UNKNOWN-072');
  INSERT INTO crm_leads (id, full_name, phone, source, stage, notes, follow_up_count, is_converted, is_lost, teacher_name, lecture_time, attended, created_by, created_at, updated_at) SELECT '125167f2-334e-573c-bc9a-c0580b4c92e5', 'بدون اسم (حجز غير مسمّى)', 'UNKNOWN-073', NULL, 'attendance_recorded', 'من شيت حضور المعلمين (هدير) - حجز في شيت المعلمين بدون اسم طالب (مكتوب "-")', 0, false, false, 'هدير', '22:00:00'::time, false, admin_id, now(), now() WHERE NOT EXISTS (SELECT 1 FROM crm_leads WHERE phone = 'UNKNOWN-073');
  INSERT INTO crm_leads (id, full_name, phone, source, stage, notes, follow_up_count, is_converted, is_lost, teacher_name, lecture_time, attended, created_by, created_at, updated_at) SELECT '1654f887-106f-518d-9e2b-d1ee7febe99b', 'بدون اسم (حجز غير مسمّى)', 'UNKNOWN-074', NULL, 'attendance_recorded', 'من شيت حضور المعلمين (هدير) - حجز في شيت المعلمين بدون اسم طالب (مكتوب "-")', 0, false, false, 'هدير', '15:00:00'::time, false, admin_id, now(), now() WHERE NOT EXISTS (SELECT 1 FROM crm_leads WHERE phone = 'UNKNOWN-074');
  INSERT INTO crm_leads (id, full_name, phone, source, stage, notes, follow_up_count, is_converted, is_lost, teacher_name, lecture_time, attended, created_by, created_at, updated_at) SELECT 'a67a1d67-0cc0-57f4-8abd-9dc5b5e6f85e', 'بدون اسم (حجز غير مسمّى)', 'UNKNOWN-075', NULL, 'attendance_recorded', 'من شيت حضور المعلمين (هدير) - حجز في شيت المعلمين بدون اسم طالب (مكتوب "-")', 0, false, false, 'هدير', '15:00:00'::time, false, admin_id, now(), now() WHERE NOT EXISTS (SELECT 1 FROM crm_leads WHERE phone = 'UNKNOWN-075');
END $$;

COMMIT;

# دليل تشغيل السيرفر — AI School Dashboard

السيرفر: Hostinger VPS (KVM 1: معالج واحد، 4GB رام) · المسار: `/docker/ai-school-dashboard`
الدومين: `dashboard.rawadaltarh.com` · التشغيل: Docker Compose

---

## 0) ترتيب التنفيذ وحالته

| # | المرحلة | الحالة |
|---|---|---|
| 1 | مراجعة الـ Dockerfiles والـ compose والبورتات والأحجام والموارد | ✅ مفيش بورتات مفتوحة غير 80/443، وكل خدمة ليها حد أقصى للرام، والـ logs بتتلف تلقائيًا (3 × 10MB) |
| 2 | Multi-stage و non-root والـ secrets والـ health checks | ✅ الباك‑إند multi-stage ويشتغل بـ `appuser`، وفرونت multi-stage + `npm ci`، والـ health check بقى `/ready` (بيتأكد من قاعدة البيانات) |
| 3 | الجدار الناري و HTTPS والصلاحيات والـ WAF والـ rate limiting | ✅ في الكود: CSP + الهيدرز الأمنية + rate limit على مستويين (nginx + الباك‑إند). ⏳ على السيرفر: خطوات القسم 2 تحت |
| 4 | الـ CDN وهيدرز الكاش والضغط والاستعلامات البطيئة | ✅ gzip للـ API، وكاش دائم للـ assets، وindexes جديدة (migration 0019)، وتسجيل الاستعلامات اللي بتاخد أكتر من 500ms |
| 5 | النسخ الاحتياطي واختبار الاسترجاع والمراقبة والـ rollback | ✅ السكربتات جاهزة في `deploy/`. ⏳ تفعيلها بالـ cron (القسم 3) |
| 6 | Redis والطوابير ثم الـ replicas | ✅ Redis للكاش وعدادات الـ rate limit. الباك‑إند بقى stateless وشغال بـ 2 workers. الطابور مش محتاجينه دلوقتي (القسم 7) |

---

## 1) المتغيرات الجديدة في `.env` (مرة واحدة)

```bash
cd /docker/ai-school-dashboard
echo "REDIS_PASSWORD=$(openssl rand -hex 32)" >> .env
```

الـ compose هيرفض يشتغل لو `REDIS_PASSWORD` مش موجود، وده مقصود.

اختياري:
- `ALERT_WEBHOOK=...` رابط webhook (Slack أو Discord أو Telegram bot) عشان تنبيهات المراقبة.
- `RCLONE_REMOTE=remote:bucket` لنسخ الباك‑أب برّه السيرفر (القسم 3).

---

## 2) تأمين السيرفر (مرة واحدة)

### الجدار الناري
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```
> Docker بيتخطّى ufw في البورتات اللي بيفتحها. عشان كده **ممنوع** إضافة `ports:` لـ postgres أو redis أو backend في الـ compose. مفيش غير nginx اللي بيفتح بورتات. للتأكد:
> ```bash
> sudo ss -tlnp | grep -v 127.0.0.1    # المفروض يظهر 22 و 80 و 443 بس
> ```

### SSH
- الدخول بالمفتاح بس: `PasswordAuthentication no` في `/etc/ssh/sshd_config`، وبعدها `sudo systemctl restart ssh`.
- `sudo apt install fail2ban` (الإعدادات الافتراضية بتحمي SSH).

### Cloudflare (لو الدومين عليه)
1. SSL/TLS ← **Full (strict)**: التشفير يبقى من المتصفح لـ Cloudflare ومن Cloudflare للسيرفر بشهادة Let's Encrypt صالحة.
2. **Always Use HTTPS** = On، وأقل إصدار TLS = 1.2.
3. Security ← WAF ← فعّل الـ Managed Rules، وضيف Rate limiting rule على `/api/auth/login`.
4. nginx بقى بياخد عنوان الزائر الحقيقي من `CF-Connecting-IP`، ومش بيصدّقه غير لو جاي من رينجات Cloudflare. القائمة موجودة في `docker-compose.yml`، وبتتحدّث من https://www.cloudflare.com/ips/.
5. (اختياري، أقوى) اقفل 80/443 على رينجات Cloudflare بس، عشان محدش يوصل للسيرفر مباشرة بالـ IP. لازم يتعمل في سلسلة `DOCKER-USER` مش في ufw. لو محتاج الخطوة دي اطلبها.

### الاستعلامات البطيئة (pg_stat_statements)
```bash
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"
# أبطأ 10 استعلامات:
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
 "SELECT round(mean_exec_time)::int AS ms, calls, left(query, 120) FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
# الاستعلامات اللي فوق 500ms بتتسجّل كمان هنا:
docker compose logs postgres | grep duration
```

---

## 3) النسخ الاحتياطي (Backup) والاسترجاع

### مفتاح التشفير (مرة واحدة)
```bash
sudo sh -c 'openssl rand -base64 48 > /root/.ai-school-backup.key && chmod 600 /root/.ai-school-backup.key'
sudo cat /root/.ai-school-backup.key   # احفظه في password manager — من غيره مفيش استرجاع
```

### الجدولة (`sudo crontab -e`)
```cron
# باك-أب يومي 3:15 الفجر بتوقيت السيرفر
15 3 * * *  /docker/ai-school-dashboard/deploy/backup.sh       >> /var/log/ai-school-backup.log 2>&1
# اختبار استرجاع أول كل شهر
40 3 1 * *  /docker/ai-school-dashboard/deploy/restore-test.sh >> /var/log/ai-school-restore-test.log 2>&1
# مراقبة كل 5 دقايق
*/5 * * * * /docker/ai-school-dashboard/deploy/healthwatch.sh  >> /var/log/ai-school-health.log 2>&1
```

### الأهداف
- **RPO** (أقصى بيانات ممكن تضيع): 24 ساعة، لأن الباك‑أب يومي. لو عايزها أقل، زوّد عدد مرات الـ cron.
- **RTO** (وقت الرجوع للخدمة): الهدف أقل من 30 دقيقة على نفس السيرفر. `restore-test.sh` بيطبع الوقت الفعلي لاسترجاع قاعدة البيانات، فراجعه كل شهر.
- على سيرفر جديد: ثبّت Docker، واعمل `git clone`، وانقل `.env` ومفتاح الباك‑أب، وبعدها `docker compose up -d` ثم `deploy/restore.sh`. الوقت المتوقع حوالي ساعة.
- **مهم:** الباك‑أب اللي على نفس السيرفر بيضيع لو السيرفر ضاع. فعّل `RCLONE_REMOTE`، أو انقل الملفات يدويًا كل أسبوع.

### استرجاع حقيقي
```bash
sudo deploy/restore.sh db-<stamp>.dump.enc attachments-<stamp>.tar.gz.enc
```
السكربت بياخد باك‑أب للوضع الحالي الأول، وبعدها بيطلب منك تكتب RESTORE للتأكيد.

---

## 4) النشر (Deploy) والرجوع لنسخة سابقة (Rollback)

```bash
cd /docker/ai-school-dashboard
sudo deploy/deploy.sh          # باك-أب ← pull ← build ← تشغيل ← فحص صحة ← رجوع تلقائي لو فشل
sudo deploy/deploy.sh --rollback   # رجوع يدوي للإصدار السابق (من غير build)
```
- كل إصدار بيتحفظ كـ image بتاج الـ commit، فالرجوع بياخد ثواني.
- الـ migrations بتضيف بس (جداول أو أعمدة أو indexes)، فالإصدار السابق بيشتغل عادي على الـ schema الأحدث. لو حصلت مشكلة في البيانات نفسها: `restore.sh` من باك‑أب ما قبل النشر.

---

## 5) المراقبة

- `healthwatch.sh` بيراقب الحمل على المعالج والرام والديسك (تنبيه فوق 85%) وحالة كل container وعدد اتصالات قاعدة البيانات (تنبيه فوق 45 من 60) وإن الموقع شغال من برّه.
- مراقبة خارجية مجانية: UptimeRobot أو Better Stack على `https://dashboard.rawadaltarh.com/health` كل 5 دقايق.
- لقطة سريعة: `docker stats --no-stream` و `docker compose ps`.
- الـ logs بصيغة JSON وكل طلب ليه `request_id` و `duration_ms`. الطلبات اللي اتمنعت بسبب الـ rate limit بتظهر بـ `rate_limited`:
  ```bash
  docker compose logs backend --since 1h | grep rate_limited
  ```

---

## 6) الـ Rate limiting: حدود منفصلة لكل نوع

| النوع | المفتاح | الحد |
|---|---|---|
| تسجيل الدخول | IP | 10 / دقيقة (وفي nginx كمان 10/دقيقة) |
| تسجيل الدخول | الحساب (الإيميل) | 20 / ساعة |
| MFA و refresh وتغيير أو استرجاع الباسورد | IP | 20 / دقيقة |
| طلب استرجاع باسورد | الحساب | 5 / ساعة |
| رفع الملفات | المستخدم أو IP | 20 / دقيقة (الحجم ≤ 15MB، والنوع PDF أو صورة، والمحتوى بيتفحص فعليًا) |
| العمليات التقيلة (التقارير والمؤشرات والمحاسبة والاستيراد) | المستخدم أو IP | 60 / دقيقة |
| باقي الـ API | المستخدم أو IP | 300 / دقيقة |
| كل الـ API | IP | 600 / دقيقة (وفي nginx كمان 20 طلب/ثانية) |

العدادات محفوظة في Redis، فكل الـ workers والنسخ بيشوفوا نفس العداد. لو Redis وقع، كل worker بيعدّ لنفسه والموقع مش بيقف. تقدر تعدّل الحدود من `docker-compose.yml` من غير ما تلمس الكود.

## الكاش (Redis)
- التقارير التقيلة بتتكاش لمدة 60 ثانية بالكتير: المؤشرات، والنظرة المالية، والقوائم المحاسبية، والقيود، وكشوف الحسابات.
- **سياسة الإبطال:** أي عملية كتابة ناجحة (POST أو PUT أو PATCH أو DELETE) بتلغي الكاش كله فورًا. فمفيش رقم قديم بيظهر بعد أي تعديل، والـ 60 ثانية مجرد شبكة أمان للتعديلات اللي بتتعمل من برّه الـ API (SQL مباشر).

---

## 7) التوسع (Scalability)

- **Stateless:** الجلسات JWT + قاعدة البيانات، والكاش والعدادات في Redis، ومفيش أي state في ذاكرة الـ container. عشان كده الباك‑إند شغال بـ `UVICORN_WORKERS=2`، وينفع يتعمله replicas بعدين.
- **اتصالات قاعدة البيانات:** 2 workers × (5 + 5) = 20 بالكتير من أصل 60. لو زودت workers أو replicas، راجع الحسبة دي.
- **رفع الملفات:** محفوظة على volume (`attachments_storage`). قبل أي replicas على أكتر من سيرفر لازم object storage (S3، أو Cloudflare R2، أو Hostinger Object Storage). مكانها في الكود جاهز (`integrations/storage`)، ومحتاج بيانات bucket.
- **طابور للمهام التقيلة:** مفيش مهام تقيلة في الخلفية حاليًا. الاستيراد سريع والتقارير متكاشة. لما نحتاج (إرسال واتساب جماعي، أو تقارير PDF كبيرة)، Redis موجود ونضيف `arq` كـ worker منفصل.
- **ملاحظة أمنية مقبولة مؤقتًا:** مكتبة `xlsx` (استيراد ملفات Excel في صفحة العملاء) عليها تحذير معروف مالوش تحديث على npm. الخطر محدود لأنها بتشتغل في متصفح المستخدم على ملفاته هو بس، وبتتحمّل بس لما حد يستورد. الحل النهائي إننا نستبدلها بنسخة SheetJS الرسمية من `cdn.sheetjs.com` أو نخلي القراءة على السيرفر.

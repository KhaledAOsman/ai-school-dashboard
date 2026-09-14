/**
 * WhatsApp connection page - shows the QR code to scan (whatsapp-web.js
 * bridge, not the official Meta API - see whatsapp-service/server.js),
 * live connection status, and the linked phone number once connected.
 */
import { MessageCircle, Smartphone, LogOut, AlertTriangle } from "lucide-react";
import { useWhatsAppStatus, useWhatsAppQr, useWhatsAppLogout } from "@/modules/whatsapp/hooks/useWhatsApp";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export function WhatsAppConnectionPage() {
  const { data: status, isLoading } = useWhatsAppStatus();
  const { data: qr } = useWhatsAppQr();
  const logout = useWhatsAppLogout();

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight text-ink-900">ربط واتساب</h1>
        <p className="mt-1 text-sm text-ink-500">اربط رقم واتساب لإرسال رسائل تلقائية للعملاء عند حجز المواعيد</p>
      </div>

      <Card className="mb-4 flex items-start gap-3 border-warning-200 bg-warning-50 p-4">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning-600" />
        <p className="text-xs text-warning-800">
          هذا الربط يستخدم مكتبة غير رسمية (مش واتساب بيزنس API الرسمي من Meta) — استخدامه لإرسال رسائل تلقائية بشكل متكرر
          قد يعرّض الرقم لخطر الحظر من واتساب. يُنصح باستخدام رقم مخصص لهذا الغرض وليس رقمًا شخصيًا أساسيًا.
        </p>
      </Card>

      <Card>
        {isLoading || !status ? (
          <p className="text-sm text-ink-500">جارٍ التحميل...</p>
        ) : status.status === "connected" ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-50 text-success-600">
                <Smartphone size={22} />
              </span>
              <div>
                <p className="flex items-center gap-2 font-semibold text-ink-900">
                  متصل
                  <Badge tone="success" dot={false}>نشط</Badge>
                </p>
                <p className="ltr-content text-sm text-ink-500">{status.phone_number}</p>
              </div>
            </div>
            <Button variant="outline" isLoading={logout.isPending} onClick={() => logout.mutate()}>
              <LogOut size={15} />
              إلغاء الربط
            </Button>
          </div>
        ) : status.status === "qr_pending" && qr ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <p className="text-sm font-medium text-ink-700">امسح رمز QR من تطبيق واتساب على هاتفك</p>
            <img src={qr.qr_data_url} alt="WhatsApp QR" className="h-64 w-64 rounded-lg ring-1 ring-ink-200" />
            <p className="text-xs text-ink-400">واتساب ← الإعدادات ← الأجهزة المرتبطة ← ربط جهاز</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <MessageCircle size={32} className="text-ink-300" />
            <p className="text-sm text-ink-500">
              {status.status === "initializing" ? "جارٍ تجهيز الاتصال..." : "غير متصل حاليًا"}
            </p>
            {status.last_error && <p className="text-xs text-danger-500">{status.last_error}</p>}
          </div>
        )}
      </Card>
    </div>
  );
}

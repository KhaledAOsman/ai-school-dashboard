/**
 * Bulk lead import: paste directly from a spreadsheet (Google Sheets/
 * Excel copy-paste produces tab-separated rows) or upload a .csv/.xlsx
 * file. Either path parses down to the same row shape, shows a preview
 * table before committing, then submits everything in one bulk-import
 * API call and reports back exactly how many were created / skipped as
 * duplicates / failed.
 */
import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, ClipboardPaste, AlertCircle, CheckCircle2, X } from "lucide-react";
import { useBulkImportLeads } from "@/modules/crm/hooks/useCRM";
import type { LeadImportRow } from "@/modules/crm/services/crmApi";
import { adminApi } from "@/modules/finance/services/adminApi";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, Textarea } from "@/components/ui/Field";

/** Normalizes free-text source values (from pasted sheets or files) down
 * to the 4 fixed platform values the backend accepts - anything that
 * doesn't clearly match one of these is dropped rather than sent as-is,
 * since an unrecognized value would fail validation and reject the whole
 * row (see LeadCreateRequest.source pattern in the backend). */
function normalizeSource(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value.includes("insta") || value.includes("انستا") || value.includes("انستجرام")) return "instagram";
  if (value.includes("tiktok") || value.includes("tik tok") || value.includes("تيك توك")) return "tiktok";
  if (value.includes("snap") || value.includes("سناب")) return "snapchat";
  if (value.includes("organic") || value.includes("عضوي") || value.includes("مباشر")) return "organic";
  return null;
}

function parseDelimitedText(text: string): LeadImportRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const tabCount = (lines[0].match(/\t/g) || []).length;
  const commaCount = (lines[0].match(/,/g) || []).length;
  const delimiter = tabCount >= commaCount ? "\t" : ",";

  let dataLines = lines;
  const firstCells = lines[0].split(delimiter).map((c) => c.trim().toLowerCase());
  const looksLikeHeader = firstCells.some((c) =>
    ["name", "الاسم", "phone", "الهاتف", "رقم", "source", "المصدر", "notes", "ملاحظات"].includes(c)
  );
  if (looksLikeHeader) dataLines = lines.slice(1);

  return dataLines
    .map((line) => {
      const cells = line.split(delimiter).map((c) => c.trim());
      const [full_name, phone, source, notes] = cells;
      return { full_name: full_name || "", phone: phone || "", source: normalizeSource(source ?? null), notes: notes || null };
    })
    .filter((row) => row.full_name && row.phone);
}

async function parseFile(file: File): Promise<LeadImportRow[]> {
  const isCsv = file.name.toLowerCase().endsWith(".csv");
  if (isCsv) {
    const text = await file.text();
    return parseDelimitedText(text);
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });

  let dataRows = rows;
  const firstRow = (rows[0] ?? []).map((c) => String(c).trim().toLowerCase());
  const looksLikeHeader = firstRow.some((c) =>
    ["name", "الاسم", "phone", "الهاتف", "رقم", "source", "المصدر", "notes", "ملاحظات"].includes(c)
  );
  if (looksLikeHeader) dataRows = rows.slice(1);

  return dataRows
    .map((r) => ({
      full_name: String(r[0] ?? "").trim(),
      phone: String(r[1] ?? "").trim(),
      source: normalizeSource(r[2] ? String(r[2]).trim() : null),
      notes: r[3] ? String(r[3]).trim() : null,
    }))
    .filter((row) => row.full_name && row.phone);
}

export function LeadImportPanel({ onDone }: { onDone: () => void }) {
  const [rows, setRows] = useState<LeadImportRow[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: users } = useQuery({ queryKey: ["admin-users"], queryFn: adminApi.listUsers });
  const bulkImport = useBulkImportLeads();

  function handlePasteChange(text: string) {
    setPasteText(text);
    setParseError(null);
    if (!text.trim()) {
      setRows([]);
      return;
    }
    const parsed = parseDelimitedText(text);
    setRows(parsed);
    if (parsed.length === 0) {
      setParseError("لم يتم التعرف على أي صفوف صالحة. تأكد من وجود عمودين على الأقل: الاسم ثم رقم الهاتف.");
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    try {
      const parsed = await parseFile(file);
      setRows(parsed);
      setPasteText("");
      if (parsed.length === 0) {
        setParseError("لم يتم العثور على بيانات صالحة في الملف. تأكد من أن العمود الأول هو الاسم والثاني رقم الهاتف.");
      }
    } catch {
      setParseError("تعذّرت قراءة الملف. تأكد من أنه بصيغة Excel (.xlsx) أو CSV صالحة.");
    }
  }

  async function handleImport() {
    if (rows.length === 0) return;
    await bulkImport.mutateAsync({ rows, assignedTo: assignedTo || null });
  }

  const result = bulkImport.data;

  return (
    <Card className="mb-5 animate-scale-in">
      <CardHeader>
        <CardTitle>استيراد عملاء بالجملة</CardTitle>
      </CardHeader>

      {result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2.5 rounded-lg bg-success-50 px-4 py-3 text-sm text-success-700 ring-1 ring-inset ring-success-100">
            <CheckCircle2 size={18} className="shrink-0" />
            <span>
              تم إنشاء <strong>{result.created_count}</strong> عميل بنجاح من أصل {result.total_submitted}.
              {result.skipped_duplicate_count > 0 && ` تم تخطي ${result.skipped_duplicate_count} كأرقام مكررة موجودة بالفعل.`}
            </span>
          </div>
          {result.error_count > 0 && (
            <div className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700 ring-1 ring-inset ring-danger-100">
              <p className="mb-1.5 font-medium">{result.error_count} صف به مشاكل:</p>
              <ul className="list-inside list-disc space-y-0.5">
                {result.errors.slice(0, 10).map((e) => (
                  <li key={e.row_index}>
                    {e.full_name || `الصف ${e.row_index + 1}`}: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button variant="primary" onClick={onDone}>
            تم
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-ink-200 px-4 py-8 text-center transition-colors hover:border-brand-300 hover:bg-brand-50/50"
            >
              <FileSpreadsheet size={24} className="text-ink-400" />
              <span className="text-sm font-medium text-ink-700">رفع ملف Excel أو CSV</span>
              <span className="text-xs text-ink-400">العمود الأول: الاسم — الثاني: الهاتف — (اختياري: المصدر، ملاحظات)</span>
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />

            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-ink-700">
                <ClipboardPaste size={14} />
                أو الصق مباشرة من جوجل شيت / إكسل
              </div>
              <Textarea
                value={pasteText}
                onChange={(e) => handlePasteChange(e.target.value)}
                rows={4}
                placeholder={"انسخ الصفوف من الشيت والصقها هنا مباشرة\nمثال:\nأحمد محمد\t0501234567\tإعلان فيسبوك"}
              />
            </div>
          </div>

          {parseError && (
            <div className="flex items-center gap-2 rounded-lg bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700 ring-1 ring-inset ring-danger-100">
              <AlertCircle size={16} className="shrink-0" />
              {parseError}
            </div>
          )}

          {rows.length > 0 && (
            <div className="animate-scale-in">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-ink-700">معاينة: {rows.length} عميل جاهز للاستيراد</p>
                <button onClick={() => { setRows([]); setPasteText(""); }} className="flex items-center gap-1 text-xs text-ink-400 hover:text-ink-700">
                  <X size={13} />
                  مسح
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg ring-1 ring-inset ring-ink-100">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-ink-50">
                    <tr>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-ink-500">الاسم</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-ink-500">الهاتف</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-ink-500">المصدر</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {rows.slice(0, 200).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-ink-800">{r.full_name}</td>
                        <td className="ltr-content px-3 py-1.5 text-left text-ink-600">{r.phone}</td>
                        <td className="px-3 py-1.5 text-ink-500">{r.source || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 200 && <p className="p-2 text-center text-xs text-ink-400">...و{rows.length - 200} صف إضافي</p>}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">إسناد الكل إلى (اختياري)</option>
              {(users ?? []).map((u) => (
                <option key={u.id} value={u.id}>{u.full_name ? `${u.full_name} — ${u.email}` : u.email}</option>
              ))}
            </Select>
          </div>

          <div className="flex gap-3">
            <Button variant="primary" disabled={rows.length === 0} isLoading={bulkImport.isPending} onClick={handleImport}>
              <Upload size={16} />
              استيراد {rows.length > 0 ? `${rows.length} عميل` : ""}
            </Button>
            <Button variant="ghost" onClick={onDone}>
              إلغاء
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

import { useState, type FormEvent } from "react";
import { useAuth } from "@/auth/AuthContext";
import { translate } from "@/i18n";

interface Props {
  challengeToken: string;
  onSuccess: () => void;
}

export function MfaVerifyForm({ challengeToken, onSuccess }: Props) {
  const { verifyMfa } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await verifyMfa(challengeToken, code);
      onSuccess();
    } catch {
      setError(translate("ar", "mfa_error"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-6 text-center">
          {translate("ar", "mfa_title")}
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {translate("ar", "mfa_code_label")}
            </label>
            <input
              type="text"
              inputMode="numeric"
              required
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="ltr-content w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500"
              autoComplete="one-time-code"
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            {translate("ar", "mfa_submit")}
          </button>
        </form>
      </div>
    </div>
  );
}

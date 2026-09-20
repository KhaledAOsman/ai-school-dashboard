import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { whatsappApi } from "@/modules/whatsapp/services/whatsappApi";

export function useWhatsAppStatus() {
  return useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: () => whatsappApi.status(),
    // Poll while not yet connected - lets the QR/status page update
    // itself live as the person scans the code, without a manual refresh.
    refetchInterval: (query) => (query.state.data?.status === "connected" ? 15000 : 3000),
  });
}

export function useWhatsAppQr() {
  return useQuery({
    queryKey: ["whatsapp-qr"],
    queryFn: () => whatsappApi.qr(),
    refetchInterval: 5000,
    retry: false,
  });
}

export function useWhatsAppLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => whatsappApi.logout(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-status"] }),
  });
}

export function useMessageTemplates(includeInactive = false) {
  return useQuery({
    queryKey: ["whatsapp-templates", includeInactive],
    queryFn: () => whatsappApi.listTemplates(includeInactive),
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; body: string; trigger: string }) => whatsappApi.createTemplate(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-templates"] }),
  });
}

export function useUpdateTemplate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name?: string; body?: string; trigger?: string; is_active?: boolean }) => whatsappApi.updateTemplate(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-templates"] }),
  });
}

export function useSendWhatsAppToLead(leadId: string) {
  return useMutation({
    mutationFn: (payload: { template_id?: string; raw_message?: string }) => whatsappApi.sendToLead(leadId, payload),
  });
}

export function useTestSendWhatsApp() {
  return useMutation({
    mutationFn: (payload: { phone: string; template_id?: string; raw_message?: string }) => whatsappApi.testSend(payload),
  });
}

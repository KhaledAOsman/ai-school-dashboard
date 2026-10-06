import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { marketingApi, type CampaignPayload, type SubscriptionPayload } from "@/modules/marketing/services/marketingApi";

// Subscriptions and campaigns feed the KPI dashboard, so every mutation
// also invalidates the KPI summary.
function useInvalidate(keys: string[]) {
  const qc = useQueryClient();
  return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function useSubscriptions() {
  return useQuery({ queryKey: ["subscriptions"], queryFn: marketingApi.listSubscriptions });
}

export function useCreateSubscription() {
  const invalidate = useInvalidate(["subscriptions", "kpi-summary"]);
  return useMutation({ mutationFn: (p: SubscriptionPayload) => marketingApi.createSubscription(p), onSuccess: invalidate });
}

export function useUpdateSubscription() {
  const invalidate = useInvalidate(["subscriptions", "kpi-summary"]);
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<SubscriptionPayload> }) =>
      marketingApi.updateSubscription(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteSubscription() {
  const invalidate = useInvalidate(["subscriptions", "kpi-summary"]);
  return useMutation({ mutationFn: (id: string) => marketingApi.deleteSubscription(id), onSuccess: invalidate });
}

export function useCampaigns() {
  return useQuery({ queryKey: ["campaigns"], queryFn: marketingApi.listCampaigns });
}

export function useCreateCampaign() {
  const invalidate = useInvalidate(["campaigns", "kpi-summary"]);
  return useMutation({ mutationFn: (p: CampaignPayload) => marketingApi.createCampaign(p), onSuccess: invalidate });
}

export function useUpdateCampaign() {
  const invalidate = useInvalidate(["campaigns", "kpi-summary"]);
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CampaignPayload> }) =>
      marketingApi.updateCampaign(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteCampaign() {
  const invalidate = useInvalidate(["campaigns", "kpi-summary"]);
  return useMutation({ mutationFn: (id: string) => marketingApi.deleteCampaign(id), onSuccess: invalidate });
}

import { api } from "@/lib/apiClient";

export type Source = "snapchat" | "meta" | "tiktok" | "organic" | "other";
export type Platform = "snapchat" | "meta" | "tiktok";

export interface Subscription {
  id: string;
  full_name: string;
  phone: string;
  amount_paid: string;
  discount_amount: string;
  list_price: string;
  subscribed_at: string;
  source: Source | null;
  lead_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface SubscriptionTotals {
  count: number;
  total_paid: string;
  total_discount: string;
  total_list_price: string;
}

export interface SubscriptionPayload {
  full_name: string;
  phone: string;
  amount_paid: string;
  discount_amount: string;
  subscribed_at: string;
  source: Source | null;
  notes: string | null;
}

export interface Campaign {
  id: string;
  platform: Platform;
  name: string;
  objective: string | null;
  spend: string;
  results_count: number | null;
  results_label: string | null;
  counts_as_leads: boolean;
  impressions: number | null;
  clicks: number | null;
  period_start: string | null;
  period_end: string | null;
  period_label: string | null;
  notes: string | null;
}

export interface CampaignPayload {
  platform: Platform;
  name: string;
  objective: string | null;
  spend: string;
  results_count: number | null;
  results_label: string | null;
  counts_as_leads: boolean;
  period_start: string | null;
  period_end: string | null;
  period_label: string | null;
  notes: string | null;
}

export interface PlatformTotals {
  platform: Platform;
  spend: string;
  leads: number;
  cost_per_lead: string | null;
  campaigns: number;
}

export const marketingApi = {
  listSubscriptions: async (): Promise<{ items: Subscription[]; totals: SubscriptionTotals }> =>
    (await api.get("/subscriptions")).data,
  createSubscription: async (payload: SubscriptionPayload): Promise<Subscription> =>
    (await api.post("/subscriptions", payload)).data,
  updateSubscription: async (id: string, payload: Partial<SubscriptionPayload>): Promise<Subscription> =>
    (await api.patch(`/subscriptions/${id}`, payload)).data,
  deleteSubscription: async (id: string): Promise<void> => {
    await api.delete(`/subscriptions/${id}`);
  },

  listCampaigns: async (): Promise<{ items: Campaign[]; platforms: PlatformTotals[]; total_spend: string }> =>
    (await api.get("/campaigns")).data,
  createCampaign: async (payload: CampaignPayload): Promise<Campaign> => (await api.post("/campaigns", payload)).data,
  updateCampaign: async (id: string, payload: Partial<CampaignPayload>): Promise<Campaign> =>
    (await api.patch(`/campaigns/${id}`, payload)).data,
  deleteCampaign: async (id: string): Promise<void> => {
    await api.delete(`/campaigns/${id}`);
  },
};

export interface Deal {
  id: string;
  name: string;
  owner: string;
  ownerId: string;
  stage: string;
  stageId: string;
  pipeline: string;
  pipelineId: string;
  value: number;
  currency: string;
  lastActivityDate: string | null;
  stageChangedAt: string | null;
  createdAt: string;
  urgencyScore: number;
  urgencyLevel: 'high' | 'medium' | 'low';
  urgencyBreakdown: {
    nextStepScore: number;
    contentScore: number;
    valueScore: number;
    activityScore: number;
  };
  contacts: Contact[];
  companies: Company[];
  lastNote: string | null;
  lastUpdateDate: string | null;
  dealUpdate: string | null;
  suggestedNextStep: string | null;
}

export interface Company {
  id: string;
  name: string;
  domain: string;
}

export interface Contact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface DealActionRow {
  dealId: string;
  dealName: string;
  owner: string;
  latestActivity: string | null;
  suggestedNextStep: string | null;
}

export interface PartnerQueueDeal {
  id: string;
  name: string;
  pipeline: string;
  stage: string;
  value: number;
}

export interface PartnerQueueItem {
  threadId: string;
  subject: string;
  partnerCompany: string;
  partnerContacts: string[];
  emailCount: number;
  latestDate: string;
  synthesis: string;
  suggestedDeal: PartnerQueueDeal | null;
  proposedNote: string;
  confidence: 'high' | 'medium' | 'low';
  allDeals: PartnerQueueDeal[];
}

export interface MsTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

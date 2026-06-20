export interface Deal {
  id: string;
  name: string;
  owner: string;
  ownerId: string;
  stage: string;
  stageId: string;
  value: number;
  currency: string;
  lastActivityDate: string | null;
  stageChangedAt: string | null;
  createdAt: string;
  urgencyScore: number;
  urgencyLevel: 'high' | 'medium' | 'low';
  urgencyBreakdown: {
    valueScore: number;
    stagnationScore: number;
    activityScore: number;
  };
  contacts: Contact[];
}

export interface Contact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface ActionItem {
  id: string;
  dealId: string;
  dealName: string;
  source: 'fellow' | 'outlook';
  description: string;
  identifiedAt: string;
  done: boolean;
  meetingTitle?: string;
  emailSubject?: string;
}

export interface QueueItem {
  id: string;
  dealId: string;
  dealName: string;
  suggestedNote: string;
  sourceType: 'email' | 'meeting';
  sourceTitle: string;
  sourceDate: string;
  confidenceReason: string;
  confidenceLevel: 'high' | 'medium' | 'low';
  status: 'pending' | 'approved' | 'rejected';
}

export interface MsTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

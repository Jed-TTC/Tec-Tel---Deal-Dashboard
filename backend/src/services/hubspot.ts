import axios from 'axios';
import { Deal, Contact } from '../types.js';

const BASE = 'https://api.hubapi.com';

function headers() {
  return { Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}` };
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / 86_400_000);
}

function urgency(value: number, stageDays: number, activityDays: number): {
  score: number;
  level: 'high' | 'medium' | 'low';
  breakdown: { valueScore: number; stagnationScore: number; activityScore: number };
} {
  // Weight: value 50%, stagnation 30%, activity 20%
  const valueScore = Math.min(100, value / 10_000);            // $1M = 100
  const stagnationScore = Math.min(100, stageDays * 3.33);     // 30 days = 100
  const activityScore = Math.min(100, activityDays * 5);       // 20 days = 100

  const score = Math.round(valueScore * 0.5 + stagnationScore * 0.3 + activityScore * 0.2);
  const level: 'high' | 'medium' | 'low' = score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low';

  return { score, level, breakdown: { valueScore: Math.round(valueScore), stagnationScore: Math.round(stagnationScore), activityScore: Math.round(activityScore) } };
}

async function fetchAllDeals(): Promise<any[]> {
  const deals: any[] = [];
  let after: string | undefined;
  const props = ['dealname', 'amount', 'dealstage', 'hubspot_owner_id', 'hs_lastmodifieddate', 'hs_latest_meeting_activity', 'notes_last_updated', 'hs_stage_probabilities', 'hs_date_entered_current_stage', 'createdate', 'closedate', 'engagements_last_meeting_booked'].join(',');

  do {
    const params: Record<string, string> = { limit: '100', properties: props };
    if (after) params.after = after;

    const res = await axios.get(`${BASE}/crm/v3/objects/deals`, {
      headers: headers(),
      params,
    });

    deals.push(...res.data.results);
    after = res.data.paging?.next?.after;
  } while (after);

  return deals;
}

async function fetchOwners(): Promise<Record<string, string>> {
  const res = await axios.get(`${BASE}/crm/v3/owners`, { headers: headers() });
  const map: Record<string, string> = {};
  for (const o of res.data.results) {
    map[o.id] = `${o.firstName} ${o.lastName}`.trim() || o.email;
  }
  return map;
}

async function fetchStages(): Promise<Record<string, string>> {
  const res = await axios.get(`${BASE}/crm/v3/pipelines/deals`, { headers: headers() });
  const map: Record<string, string> = {};
  for (const pipeline of res.data.results) {
    for (const stage of pipeline.stages) {
      map[stage.id] = stage.label;
    }
  }
  return map;
}

async function fetchDealContacts(dealId: string): Promise<Contact[]> {
  try {
    const res = await axios.get(
      `${BASE}/crm/v3/objects/deals/${dealId}/associations/contacts`,
      { headers: headers() }
    );
    const contactIds: string[] = res.data.results.map((r: any) => r.id);
    if (!contactIds.length) return [];

    const batch = await axios.post(
      `${BASE}/crm/v3/objects/contacts/batch/read`,
      {
        inputs: contactIds.map(id => ({ id })),
        properties: ['email', 'firstname', 'lastname'],
      },
      { headers: headers() }
    );
    return batch.data.results.map((c: any) => ({
      id: c.id,
      email: c.properties.email || '',
      firstName: c.properties.firstname || '',
      lastName: c.properties.lastname || '',
    }));
  } catch {
    return [];
  }
}

export async function getDeals(): Promise<Deal[]> {
  const [rawDeals, owners, stages] = await Promise.all([
    fetchAllDeals(),
    fetchOwners(),
    fetchStages(),
  ]);

  // Fetch contacts for each deal (batched to avoid rate limits)
  const contactMap: Record<string, Contact[]> = {};
  const chunks = [];
  for (let i = 0; i < rawDeals.length; i += 10) chunks.push(rawDeals.slice(i, i + 10));
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async d => {
        contactMap[d.id] = await fetchDealContacts(d.id);
      })
    );
  }

  return rawDeals.map(d => {
    const p = d.properties;
    const value = parseFloat(p.amount || '0');
    const stageEnteredAt = p.hs_date_entered_current_stage || p.createdate;
    const lastActivity = p.hs_lastmodifieddate || p.notes_last_updated;

    const stageDays = daysSince(stageEnteredAt);
    const activityDays = daysSince(lastActivity);

    const { score, level, breakdown } = urgency(value, stageDays, activityDays);

    return {
      id: d.id,
      name: p.dealname || 'Untitled Deal',
      owner: owners[p.hubspot_owner_id] || 'Unassigned',
      ownerId: p.hubspot_owner_id || '',
      stage: stages[p.dealstage] || p.dealstage || 'Unknown',
      stageId: p.dealstage || '',
      value,
      currency: 'USD',
      lastActivityDate: lastActivity || null,
      stageChangedAt: stageEnteredAt || null,
      createdAt: p.createdate || '',
      urgencyScore: score,
      urgencyLevel: level,
      urgencyBreakdown: breakdown,
      contacts: contactMap[d.id] || [],
    };
  });
}

export async function postDealNote(dealId: string, note: string): Promise<void> {
  await axios.post(
    `${BASE}/crm/v3/objects/notes`,
    {
      properties: {
        hs_note_body: note,
        hs_timestamp: new Date().toISOString(),
      },
      associations: [
        {
          to: { id: dealId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }],
        },
      ],
    },
    { headers: headers() }
  );
}

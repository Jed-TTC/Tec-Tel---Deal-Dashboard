import axios from 'axios';
import { Deal, Contact, Company } from '../types.js';

const BASE = 'https://api.hubapi.com';

function headers() {
  return { Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}` };
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / 86_400_000);
}

function nextStepUrgencySignal(nextStep: string | null): number {
  if (!nextStep) return 20;

  const text = nextStep.toLowerCase();
  let score = 40;

  const closing = ['sign', 'contract', 'close', 'purchase order', 'final approval', 'commit', 'decision'];
  const urgent  = ['urgent', 'asap', 'immediately', 'deadline', 'today', 'critical', 'overdue'];
  const action  = ['schedule', 'send', 'call', 'confirm', 'negotiate', 'present', 'demo', 'proposal', 'follow up', 'reach out'];
  const stalled = ['waiting', 'no response', 'pending', 'delayed', 'on hold', 'unresponsive'];

  for (const s of closing) if (text.includes(s)) score += 25;
  for (const s of urgent)  if (text.includes(s)) score += 20;
  for (const s of action)  if (text.includes(s)) score += 10;
  for (const s of stalled) if (text.includes(s)) score -= 20;

  return Math.max(0, Math.min(100, score));
}

function contentUrgencySignal(dealUpdate: string | null): number {
  if (!dealUpdate) return 20;

  const text = dealUpdate.toLowerCase();
  let score = 40;

  const closing = ['contract', 'sign', 'signing', 'close', 'closing', 'purchase order', ' po ', 'legal', 'agreement', 'renewal', 'budget approved', 'approved', 'ready to proceed', 'commit', 'final'];
  const action  = ['urgent', 'asap', 'deadline', 'decision', 'follow up', 'follow-up', 'waiting on', 'pending', 'proposal', 'demo', 'trial'];
  const engaged = ['interested', 'meeting', 'call scheduled', 'reviewing', 'evaluating', 'excited', 'positive'];
  const atRisk  = ['competitor', 'competition', 'at risk', 'losing', 'concerned', 'issue'];
  const stalled = ['no response', 'ghosted', 'paused', 'on hold', 'delayed', 'postponed', 'not interested', 'budget freeze', 'unresponsive'];

  for (const s of closing) if (text.includes(s)) score += 25;
  for (const s of action)  if (text.includes(s)) score += 15;
  for (const s of engaged) if (text.includes(s)) score += 8;
  for (const s of atRisk)  if (text.includes(s)) score += 10;
  for (const s of stalled) if (text.includes(s)) score -= 25;

  return Math.max(0, Math.min(100, score));
}

export function calcUrgency(
  value: number,
  activityDays: number,
  dealUpdate: string | null,
  nextStep: string | null,
): {
  score: number;
  level: 'high' | 'medium' | 'low';
  breakdown: { nextStepScore: number; contentScore: number; valueScore: number; activityScore: number };
} {
  const nextStepScore = nextStepUrgencySignal(nextStep);
  const contentScore  = contentUrgencySignal(dealUpdate);
  const valueScore    = Math.min(100, value / 10_000);  // $1M = 100
  const activityScore = Math.min(100, activityDays * 5); // 20 days = 100

  // Weights: nextStep 40%, content 30%, value 20%, activity 10%
  const score = Math.round(
    nextStepScore * 0.40 +
    contentScore  * 0.30 +
    valueScore    * 0.20 +
    activityScore * 0.10
  );
  const level: 'high' | 'medium' | 'low' = score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low';

  return {
    score, level,
    breakdown: {
      nextStepScore: Math.round(nextStepScore),
      contentScore:  Math.round(contentScore),
      valueScore:    Math.round(valueScore),
      activityScore: Math.round(activityScore),
    },
  };
}

export async function batchAssoc(
  fromType: string,
  toType: string,
  ids: string[],
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await axios.post(
      `${BASE}/crm/v4/associations/${fromType}/${toType}/batch/read`,
      { inputs: chunk.map(id => ({ id })) },
      { headers: headers() }
    );
    for (const r of res.data.results || []) {
      result[r.from.id] = (r.to || []).map((t: any) => t.toObjectId?.toString()).filter(Boolean);
    }
  }
  return result;
}

async function fetchAllDeals(): Promise<any[]> {
  const deals: any[] = [];
  let after: string | undefined;
  const props = ['dealname', 'amount', 'dealstage', 'pipeline', 'hubspot_owner_id', 'hs_lastmodifieddate', 'hs_latest_meeting_activity', 'notes_last_updated', 'hs_stage_probabilities', 'hs_date_entered_current_stage', 'createdate', 'closedate', 'engagements_last_meeting_booked'].join(',');

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

async function fetchPipelinesAndStages(): Promise<{
  stageMap: Record<string, string>;
  pipelineMap: Record<string, string>;
  stageToPipelineMap: Record<string, string>;
}> {
  const res = await axios.get(`${BASE}/crm/v3/pipelines/deals`, { headers: headers() });
  const stageMap: Record<string, string> = {};
  const pipelineMap: Record<string, string> = {};
  const stageToPipelineMap: Record<string, string> = {};
  for (const pipeline of res.data.results) {
    pipelineMap[pipeline.id] = pipeline.label;
    for (const stage of pipeline.stages) {
      stageMap[stage.id] = stage.label;
      stageToPipelineMap[stage.id] = pipeline.label;
    }
  }
  return { stageMap, pipelineMap, stageToPipelineMap };
}

export async function fetchPipelinesConfig(): Promise<{ id: string; name: string; stages: { id: string; name: string }[] }[]> {
  const res = await axios.get(`${BASE}/crm/v3/pipelines/deals`, { headers: headers() });
  return res.data.results.map((pipeline: any) => ({
    id: pipeline.id,
    name: pipeline.label,
    stages: (pipeline.stages || []).map((s: any) => ({ id: s.id, name: s.label })),
  }));
}

async function fetchAllDealContacts(dealIds: string[]): Promise<Record<string, Contact[]>> {
  if (!dealIds.length) return {};

  try {
    const dealContactIds = await batchAssoc('deals', 'contacts', dealIds);

    // Collect unique contact IDs
    const allContactIds = [...new Set(Object.values(dealContactIds).flat())];
    if (!allContactIds.length) return {};

    // Batch fetch contact details (max 100 per call)
    const contactMap: Record<string, Contact> = {};
    for (let i = 0; i < allContactIds.length; i += 100) {
      const chunk = allContactIds.slice(i, i + 100);
      const contactRes = await axios.post(
        `${BASE}/crm/v3/objects/contacts/batch/read`,
        { inputs: chunk.map(id => ({ id })), properties: ['email', 'firstname', 'lastname'] },
        { headers: headers() }
      );
      for (const c of contactRes.data.results || []) {
        contactMap[c.id] = {
          id: c.id,
          email: c.properties.email || '',
          firstName: c.properties.firstname || '',
          lastName: c.properties.lastname || '',
        };
      }
    }

    // Map back to deals
    const result: Record<string, Contact[]> = {};
    for (const dealId of dealIds) {
      result[dealId] = (dealContactIds[dealId] || []).map(cid => contactMap[cid]).filter(Boolean);
    }
    return result;
  } catch (err: any) {
    console.error('fetchAllDealContacts error:', err.response?.data || err.message);
    return {};
  }
}

async function fetchAllDealCompanies(dealIds: string[]): Promise<Record<string, Company[]>> {
  if (!dealIds.length) return {};
  try {
    const dealCompanyIds = await batchAssoc('deals', 'companies', dealIds);

    const allCompanyIds = [...new Set(Object.values(dealCompanyIds).flat())];
    if (!allCompanyIds.length) return {};

    const companyMap: Record<string, Company> = {};
    for (let i = 0; i < allCompanyIds.length; i += 100) {
      const chunk = allCompanyIds.slice(i, i + 100);
      const res = await axios.post(
        `${BASE}/crm/v3/objects/companies/batch/read`,
        { inputs: chunk.map(id => ({ id })), properties: ['name', 'domain'] },
        { headers: headers() }
      );
      for (const c of res.data.results || []) {
        companyMap[c.id] = { id: c.id, name: c.properties.name || '', domain: c.properties.domain || '' };
      }
    }

    const result: Record<string, Company[]> = {};
    for (const dealId of dealIds) {
      result[dealId] = (dealCompanyIds[dealId] || []).map(cid => companyMap[cid]).filter(Boolean);
    }
    return result;
  } catch (err: any) {
    console.error('fetchAllDealCompanies error:', err.response?.data || err.message);
    return {};
  }
}

export async function getDeals(): Promise<{ deals: Deal[]; activitiesMap: Record<string, string[]> }> {
  const [rawDeals, owners, { stageMap, pipelineMap, stageToPipelineMap }] = await Promise.all([
    fetchAllDeals(),
    fetchOwners(),
    fetchPipelinesAndStages(),
  ]);

  const dealIds = rawDeals.map(d => d.id);
  const since = Date.now() - 365 * 86_400_000;

  const [contactMap, companyMap, allActivities] = await Promise.all([
    fetchAllDealContacts(dealIds),
    fetchAllDealCompanies(dealIds),
    gatherAllActivities(since),
  ]);

  // Derive most-recent note (for urgency) and full activity list (for synthesis) in one pass
  const noteMap: Record<string, string> = {};
  const activitiesMap: Record<string, string[]> = {};
  const lastActivityTimestampMap: Record<string, number> = {};
  for (const dealId of dealIds) {
    const candidates = allActivities[dealId] || [];
    if (!candidates.length) continue;
    candidates.sort((a, b) => b.timestamp - a.timestamp);
    noteMap[dealId] = candidates[0].text;
    lastActivityTimestampMap[dealId] = candidates[0].timestamp;
    activitiesMap[dealId] = candidates.slice(0, 8).map(c => c.text);
  }

  const deals = rawDeals.map(d => {
    const p = d.properties;
    const value = parseFloat(p.amount || '0');
    const stageEnteredAt = p.hs_date_entered_current_stage || p.createdate;
    const lastActivity = p.hs_lastmodifieddate || p.notes_last_updated;

    return {
      id: d.id,
      name: p.dealname || 'Untitled Deal',
      owner: owners[p.hubspot_owner_id] || 'Unassigned',
      ownerId: p.hubspot_owner_id || '',
      stage: stageMap[p.dealstage] || p.dealstage || 'Unknown',
      stageId: p.dealstage || '',
      pipeline: pipelineMap[p.pipeline] || stageToPipelineMap[p.dealstage] || 'Unknown Pipeline',
      pipelineId: p.pipeline || '',
      value,
      currency: 'USD',
      lastActivityDate: lastActivity || null,
      stageChangedAt: stageEnteredAt || null,
      createdAt: p.createdate || '',
      urgencyScore: 0,
      urgencyLevel: 'low' as const,
      urgencyBreakdown: { nextStepScore: 0, contentScore: 0, valueScore: 0, activityScore: 0 },
      contacts: contactMap[d.id] || [],
      companies: companyMap[d.id] || [],
      lastNote: noteMap[d.id] || null,
      lastUpdateDate: lastActivityTimestampMap[d.id]
        ? new Date(lastActivityTimestampMap[d.id]).toISOString()
        : (p.notes_last_updated || p.hs_lastmodifieddate || null),
      dealUpdate: null,
      suggestedNextStep: null,
    };
  });

  return { deals, activitiesMap };
}

interface ActivityCandidate {
  text: string;
  timestamp: number;
}

async function searchAllPages(
  objectType: string,
  filterGroups: any[],
  properties: string[],
  maxItems = 500,
): Promise<any[]> {
  const results: any[] = [];
  let after: string | undefined;
  do {
    const body: any = {
      filterGroups,
      properties,
      sorts: [{ propertyName: properties.includes('hs_timestamp') ? 'hs_timestamp' : properties[0], direction: 'DESCENDING' }],
      limit: 100,
    };
    if (after) body.after = after;
    const res = await axios.post(`${BASE}/crm/v3/objects/${objectType}/search`, body, { headers: headers() });
    results.push(...(res.data.results || []));
    after = res.data.paging?.next?.after;
  } while (after && results.length < maxItems);
  return results;
}

async function fetchRecentNotes(since: number): Promise<Record<string, ActivityCandidate[]>> {
  try {
    const notes = await searchAllPages('notes',
      [{ filters: [{ propertyName: 'hs_timestamp', operator: 'GTE', value: String(since) }] }],
      ['hs_note_body', 'hs_timestamp'],
    );

    const ids: string[] = notes.map((n: any) => n.id);
    if (!ids.length) return {};

    const idToDealIds = await batchAssoc('notes', 'deals', ids);

    const result: Record<string, ActivityCandidate[]> = {};
    for (const note of notes) {
      const text = (note.properties.hs_note_body || '')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const candidate: ActivityCandidate = { text, timestamp: new Date(note.properties.hs_timestamp).getTime() };
      for (const dealId of idToDealIds[note.id] || []) {
        if (!result[dealId]) result[dealId] = [];
        result[dealId].push(candidate);
      }
    }
    return result;
  } catch (err: any) {
    console.error('fetchRecentNotes error:', err.response?.data || err.message);
    return {};
  }
}

async function resolveEmailToDealIds(emailIds: string[]): Promise<Record<string, Set<string>>> {
  // HubSpot emails are often only associated with CONTACTS, not the deal directly.
  // We resolve both paths: email→deal (direct) and email→contact→deal (indirect).
  const emailToDealIds: Record<string, Set<string>> = {};

  const [directDealMap, contactMap] = await Promise.all([
    batchAssoc('emails', 'deals', emailIds),
    batchAssoc('emails', 'contacts', emailIds),
  ]);

  // Direct: email → deal
  for (const [emailId, dealIds] of Object.entries(directDealMap)) {
    emailToDealIds[emailId] = new Set(dealIds);
  }

  // Collect all contact IDs touched by these emails
  const emailToContactIds: Record<string, string[]> = {};
  const allContactIds = new Set<string>();
  for (const [emailId, cids] of Object.entries(contactMap)) {
    if (cids.length) { emailToContactIds[emailId] = cids; cids.forEach(id => allContactIds.add(id)); }
  }

  // Indirect: contact → deal, then map back to email
  if (allContactIds.size) {
    const contactToDealIds = await batchAssoc('contacts', 'deals', [...allContactIds]);
    for (const emailId of emailIds) {
      if (!emailToContactIds[emailId]) continue;
      if (!emailToDealIds[emailId]) emailToDealIds[emailId] = new Set();
      for (const cid of emailToContactIds[emailId]) {
        for (const dealId of (contactToDealIds[cid] || [])) {
          emailToDealIds[emailId].add(dealId);
        }
      }
    }
  }

  return emailToDealIds;
}

async function fetchRecentEmails(since: number): Promise<Record<string, ActivityCandidate[]>> {
  try {
    const emails = await searchAllPages('emails',
      [{ filters: [{ propertyName: 'hs_timestamp', operator: 'GTE', value: String(since) }] }],
      ['hs_email_subject', 'hs_email_text', 'hs_timestamp'],
    );

    const ids: string[] = emails.map((e: any) => e.id);
    if (!ids.length) return {};

    const emailToDealIds = await resolveEmailToDealIds(ids);

    const result: Record<string, ActivityCandidate[]> = {};
    for (const email of emails) {
      const subject = email.properties.hs_email_subject || '(no subject)';
      const body = (email.properties.hs_email_text || '')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
      const text = body ? `Email: ${subject} — ${body}` : `Email: ${subject}`;
      const candidate: ActivityCandidate = { text, timestamp: new Date(email.properties.hs_timestamp).getTime() };
      for (const dealId of emailToDealIds[email.id] || []) {
        if (!result[dealId]) result[dealId] = [];
        result[dealId].push(candidate);
      }
    }
    return result;
  } catch (err: any) {
    console.error('fetchRecentEmails error:', err.response?.data || err.message);
    return {};
  }
}

async function fetchRecentMeetings(since: number): Promise<Record<string, ActivityCandidate[]>> {
  try {
    const meetings = await searchAllPages('meetings',
      [{ filters: [{ propertyName: 'hs_timestamp', operator: 'GTE', value: String(since) }] }],
      ['hs_meeting_title', 'hs_meeting_body', 'hs_timestamp'],
    );

    const ids: string[] = meetings.map((m: any) => m.id);
    if (!ids.length) return {};

    const idToDealIds = await batchAssoc('meetings', 'deals', ids);

    const result: Record<string, ActivityCandidate[]> = {};
    for (const meeting of meetings) {
      const title = meeting.properties.hs_meeting_title || 'Meeting';
      const body = (meeting.properties.hs_meeting_body || '')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
      const text = body ? `Meeting: ${title} — ${body}` : `Meeting: ${title}`;
      const candidate: ActivityCandidate = { text, timestamp: new Date(meeting.properties.hs_timestamp).getTime() };
      for (const dealId of idToDealIds[meeting.id] || []) {
        if (!result[dealId]) result[dealId] = [];
        result[dealId].push(candidate);
      }
    }
    return result;
  } catch (err: any) {
    console.error('fetchRecentMeetings error:', err.response?.data || err.message);
    return {};
  }
}

async function fetchRecentCalls(since: number): Promise<Record<string, ActivityCandidate[]>> {
  try {
    const calls = await searchAllPages('calls',
      [{ filters: [{ propertyName: 'hs_timestamp', operator: 'GTE', value: String(since) }] }],
      ['hs_call_title', 'hs_call_body', 'hs_call_status', 'hs_timestamp'],
    );

    const ids: string[] = calls.map((c: any) => c.id);
    if (!ids.length) return {};

    const idToDealIds = await batchAssoc('calls', 'deals', ids);

    const result: Record<string, ActivityCandidate[]> = {};
    for (const call of calls) {
      const title = call.properties.hs_call_title || 'Call';
      const body = (call.properties.hs_call_body || '')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
      const status = call.properties.hs_call_status || '';
      const text = body
        ? `Call: ${title} — ${body}`
        : status ? `Call: ${title} (${status})` : `Call: ${title}`;
      const candidate: ActivityCandidate = { text, timestamp: new Date(call.properties.hs_timestamp).getTime() };
      for (const dealId of idToDealIds[call.id] || []) {
        if (!result[dealId]) result[dealId] = [];
        result[dealId].push(candidate);
      }
    }
    return result;
  } catch (err: any) {
    console.error('fetchRecentCalls error:', err.response?.data || err.message);
    return {};
  }
}

async function gatherAllActivities(since: number): Promise<Record<string, ActivityCandidate[]>> {
  const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
  const noteMap = await fetchRecentNotes(since);
  await pause(600);
  const emailMap = await fetchRecentEmails(since);
  await pause(600);
  const meetingMap = await fetchRecentMeetings(since);
  await pause(600);
  const callMap = await fetchRecentCalls(since);

  const combined: Record<string, ActivityCandidate[]> = {};
  for (const map of [noteMap, emailMap, meetingMap, callMap]) {
    for (const [dealId, candidates] of Object.entries(map)) {
      if (!combined[dealId]) combined[dealId] = [];
      combined[dealId].push(...candidates);
    }
  }
  return combined;
}

async function fetchLatestActivityPerDeal(dealIds: string[]): Promise<Record<string, string>> {
  if (!dealIds.length) return {};
  const since = Date.now() - 180 * 86_400_000;
  const all = await gatherAllActivities(since);

  const result: Record<string, string> = {};
  for (const dealId of dealIds) {
    const candidates = all[dealId];
    if (!candidates?.length) continue;
    candidates.sort((a, b) => b.timestamp - a.timestamp);
    result[dealId] = candidates[0].text;
  }
  return result;
}

export async function fetchAllRecentActivitiesPerDeal(dealIds: string[]): Promise<Record<string, string[]>> {
  if (!dealIds.length) return {};
  const since = Date.now() - 180 * 86_400_000;
  const all = await gatherAllActivities(since);

  const result: Record<string, string[]> = {};
  for (const dealId of dealIds) {
    const candidates = all[dealId];
    if (!candidates?.length) continue;
    candidates.sort((a, b) => b.timestamp - a.timestamp);
    result[dealId] = candidates.slice(0, 8).map(c => c.text);
  }
  return result;
}

export interface DealTask {
  id: string;
  dealId: string;
  title: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
}

export async function getDealTasks(): Promise<DealTask[]> {
  try {
    const res = await axios.get(`${BASE}/crm/v3/objects/tasks`, {
      headers: headers(),
      params: {
        limit: 100,
        properties: 'hs_task_subject,hs_task_status,hs_due_date,hs_timestamp',
        associations: 'deals',
      },
    });

    const tasks: DealTask[] = [];
    for (const task of res.data.results || []) {
      const dealResults = task.associations?.deals?.results || [];
      for (const assoc of dealResults) {
        tasks.push({
          id: `hs-task-${task.id}-${assoc.id}`,
          dealId: assoc.id,
          title: task.properties.hs_task_subject || 'Task',
          status: task.properties.hs_task_status || 'NOT_STARTED',
          dueDate: task.properties.hs_due_date || null,
          createdAt: task.properties.hs_timestamp || task.createdAt,
        });
      }
    }
    return tasks;
  } catch (err: any) {
    console.error('getDealTasks error:', err.response?.data || err.message);
    return [];
  }
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

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { batchAssoc, postDealNote } from './hubspot.js';
import { synthesizePartnerThread } from './anthropic.js';
import { PartnerQueueItem, PartnerQueueDeal } from '../types.js';

const BASE = 'https://api.hubapi.com';

function headers() {
  return { Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}` };
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STATE_PATH = path.join(DATA_DIR, 'partner-queue-state.json');

interface QueueState {
  reviewed: string[];
  skipped: string[];
}

function loadState(): { reviewed: Set<string>; skipped: Set<string> } {
  try {
    const raw: QueueState = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    return { reviewed: new Set(raw.reviewed || []), skipped: new Set(raw.skipped || []) };
  } catch {
    return { reviewed: new Set(), skipped: new Set() };
  }
}

function saveState(reviewed: Set<string>, skipped: Set<string>) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify({ reviewed: [...reviewed], skipped: [...skipped] }, null, 2));
}

function normalizeSubject(subject: string): string {
  return subject.replace(/^(re:|fwd:|fw:)\s*/gi, '').trim().toLowerCase();
}

function makeThreadId(normalized: string): string {
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) + hash) + normalized.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

interface PartnerContact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

async function fetchPartnerContacts(): Promise<{
  contacts: PartnerContact[];
  contactCompanyMap: Record<string, string>;
}> {
  let companies: { id: string; name: string }[] = [];
  try {
    const res = await axios.post(`${BASE}/crm/v3/objects/companies/search`, {
      filterGroups: [{ filters: [{ propertyName: 'is_partner', operator: 'EQ', value: 'true' }] }],
      properties: ['name'],
      limit: 100,
    }, { headers: headers() });
    companies = (res.data.results || []).map((c: any) => ({
      id: c.id,
      name: c.properties.name || '',
    }));
  } catch (err: any) {
    console.error('partnerQueue - fetchPartnerContacts error:', err.response?.data?.message || err.message);
    return { contacts: [], contactCompanyMap: {} };
  }

  if (!companies.length) return { contacts: [], contactCompanyMap: {} };

  const companyLabelMap: Record<string, string> = Object.fromEntries(companies.map(c => [c.id, c.name]));
  const companyIds = companies.map(c => c.id);

  const companyToContactIds: Record<string, string[]> = {};
  for (let i = 0; i < companyIds.length; i += 100) {
    const chunk = companyIds.slice(i, i + 100);
    try {
      const res = await axios.post(
        `${BASE}/crm/v4/associations/companies/contacts/batch/read`,
        { inputs: chunk.map(id => ({ id })) },
        { headers: headers() }
      );
      for (const r of res.data.results || []) {
        companyToContactIds[r.from.id] = (r.to || []).map((t: any) => t.toObjectId?.toString()).filter(Boolean);
      }
    } catch (err: any) {
      console.error('partnerQueue - company-contact assoc error:', err.response?.data || err.message);
    }
  }

  // Build contactId → company name map
  const contactCompanyMap: Record<string, string> = {};
  for (const [companyId, contactIds] of Object.entries(companyToContactIds)) {
    for (const contactId of contactIds) {
      contactCompanyMap[contactId] = companyLabelMap[companyId] || '';
    }
  }

  const allContactIds = [...new Set(Object.values(companyToContactIds).flat())];
  if (!allContactIds.length) return { contacts: [], contactCompanyMap: {} };

  const contacts: PartnerContact[] = [];
  for (let i = 0; i < allContactIds.length; i += 100) {
    const chunk = allContactIds.slice(i, i + 100);
    try {
      const res = await axios.post(
        `${BASE}/crm/v3/objects/contacts/batch/read`,
        { inputs: chunk.map(id => ({ id })), properties: ['email', 'firstname', 'lastname'] },
        { headers: headers() }
      );
      for (const c of res.data.results || []) {
        contacts.push({
          id: c.id,
          email: (c.properties.email || '').toLowerCase(),
          firstName: c.properties.firstname || '',
          lastName: c.properties.lastname || '',
        });
      }
    } catch (err: any) {
      console.error('partnerQueue - contact batch read error:', err.response?.data || err.message);
    }
  }

  return { contacts, contactCompanyMap };
}

async function fetchDealDetails(dealIds: string[]): Promise<PartnerQueueDeal[]> {
  if (!dealIds.length) return [];

  let stageMap: Record<string, string> = {};
  let pipelineMap: Record<string, string> = {};
  try {
    const res = await axios.get(`${BASE}/crm/v3/pipelines/deals`, { headers: headers() });
    for (const p of res.data.results || []) {
      pipelineMap[p.id] = p.label;
      for (const s of p.stages || []) stageMap[s.id] = s.label;
    }
  } catch {}

  const result: PartnerQueueDeal[] = [];
  for (let i = 0; i < dealIds.length; i += 100) {
    const chunk = dealIds.slice(i, i + 100);
    try {
      const res = await axios.post(
        `${BASE}/crm/v3/objects/deals/batch/read`,
        { inputs: chunk.map(id => ({ id })), properties: ['dealname', 'amount', 'dealstage', 'pipeline'] },
        { headers: headers() }
      );
      for (const d of res.data.results || []) {
        result.push({
          id: d.id,
          name: d.properties.dealname || 'Untitled',
          pipeline: pipelineMap[d.properties.pipeline] || d.properties.pipeline || '',
          stage: stageMap[d.properties.dealstage] || d.properties.dealstage || '',
          value: parseFloat(d.properties.amount || '0'),
        });
      }
    } catch (err: any) {
      console.error('partnerQueue - fetchDealDetails error:', err.response?.data || err.message);
    }
  }
  return result;
}

export async function getQueueItems(): Promise<PartnerQueueItem[]> {
  const state = loadState();
  const { contacts, contactCompanyMap } = await fetchPartnerContacts();
  if (!contacts.length) return [];

  const contactMap = Object.fromEntries(contacts.map(c => [c.id, c]));

  // Build lookup: email address → contact ID (for matching sender/recipient)
  const partnerEmailAddrs = new Set<string>();
  const emailAddrToContactId: Record<string, string> = {};
  for (const c of contacts) {
    if (c.email) {
      partnerEmailAddrs.add(c.email);
      emailAddrToContactId[c.email] = c.id;
    }
  }

  if (!partnerEmailAddrs.size) return [];

  // Search recent emails from HubSpot, filter to partner-related ones by sender/recipient
  const since = Date.now() - 30 * 86_400_000;
  const partnerEmails: any[] = [];
  try {
    let after: string | undefined;
    do {
      const body: any = {
        filterGroups: [{ filters: [{ propertyName: 'hs_timestamp', operator: 'GTE', value: String(since) }] }],
        properties: ['hs_email_subject', 'hs_email_text', 'hs_timestamp', 'hs_email_from_email', 'hs_email_to_email'],
        sorts: [{ propertyName: 'hs_timestamp', direction: 'DESCENDING' }],
        limit: 100,
      };
      if (after) body.after = after;
      const res = await axios.post(`${BASE}/crm/v3/objects/emails/search`, body, { headers: headers() });
      for (const e of res.data.results || []) {
        const from = (e.properties.hs_email_from_email || '').toLowerCase();
        const to = (e.properties.hs_email_to_email || '').toLowerCase();
        const isPartner = [...partnerEmailAddrs].some(pe => from.includes(pe) || to.includes(pe));
        if (isPartner) partnerEmails.push(e);
      }
      after = res.data.paging?.next?.after;
    } while (after && partnerEmails.length < 200);
  } catch (err: any) {
    console.error('partnerQueue - email search error:', err.response?.data || err.message);
    return [];
  }

  if (!partnerEmails.length) return [];

  // Group by thread (normalized subject), skip already-reviewed/skipped
  const threads: Record<string, {
    threadId: string;
    subject: string;
    emails: any[];
    contactIds: Set<string>;
  }> = {};

  for (const email of partnerEmails) {
    const rawSubject = email.properties.hs_email_subject || '';
    const norm = normalizeSubject(rawSubject);
    const threadId = makeThreadId(norm);

    if (state.reviewed.has(threadId) || state.skipped.has(threadId)) continue;

    if (!threads[threadId]) {
      const cleanSubject = rawSubject.replace(/^(re:|fwd:|fw:)\s*/gi, '').trim() || rawSubject;
      threads[threadId] = { threadId, subject: cleanSubject, emails: [], contactIds: new Set() };
    }
    threads[threadId].emails.push(email);

    // Link partner contacts to this thread via email address matching
    const from = (email.properties.hs_email_from_email || '').toLowerCase();
    const to = (email.properties.hs_email_to_email || '').toLowerCase();
    for (const pe of partnerEmailAddrs) {
      if (from.includes(pe) || to.includes(pe)) {
        const cid = emailAddrToContactId[pe];
        if (cid) threads[threadId].contactIds.add(cid);
      }
    }
  }

  const threadList = Object.values(threads);
  if (!threadList.length) return [];

  // Get deal associations for all thread emails at once
  const allThreadEmailIds = [...new Set(threadList.flatMap(t => t.emails.map((e: any) => e.id)))];
  let emailToDealIds: Record<string, string[]> = {};
  try {
    emailToDealIds = await batchAssoc('emails', 'deals', allThreadEmailIds);
  } catch (err: any) {
    console.error('partnerQueue - email-deal batchAssoc error:', err.response?.data || err.message);
  }

  // Fetch all referenced deal details in one batch
  const allDealIds = [...new Set(Object.values(emailToDealIds).flat())];
  const allDealDetails = await fetchDealDetails(allDealIds);
  const dealMap = Object.fromEntries(allDealDetails.map(d => [d.id, d]));

  // Synthesize each thread with Claude
  const items: PartnerQueueItem[] = [];
  for (const thread of threadList) {
    const threadDealIds = [...new Set(thread.emails.flatMap((e: any) => emailToDealIds[e.id] || []))];
    const threadDeals = threadDealIds.map(id => dealMap[id]).filter(Boolean) as PartnerQueueDeal[];

    const involvedContacts = [...thread.contactIds].map(id => contactMap[id]).filter(Boolean) as PartnerContact[];
    const partnerCompany = involvedContacts.length
      ? (contactCompanyMap[involvedContacts[0].id] || 'Unknown Partner')
      : 'Unknown Partner';
    const partnerContactNames = involvedContacts.map(c =>
      `${c.firstName} ${c.lastName}`.trim() || c.email
    );

    thread.emails.sort((a: any, b: any) =>
      new Date(a.properties.hs_timestamp).getTime() - new Date(b.properties.hs_timestamp).getTime()
    );
    const latestEmail = thread.emails[thread.emails.length - 1];
    const latestDate = latestEmail?.properties.hs_timestamp || new Date().toISOString();

    const emailTexts = thread.emails.map((e: any) => {
      const from = e.properties.hs_email_from_email || '';
      const body = (e.properties.hs_email_text || '')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);
      return `From: ${from}\n${body}`;
    });

    const synthesis = await synthesizePartnerThread(thread.subject, emailTexts, threadDeals);
    if (!synthesis) continue;

    const suggestedDeal = synthesis.dealId ? (dealMap[synthesis.dealId] ?? null) : null;

    items.push({
      threadId: thread.threadId,
      subject: thread.subject,
      partnerCompany,
      partnerContacts: partnerContactNames,
      emailCount: thread.emails.length,
      latestDate,
      synthesis: synthesis.synthesis,
      suggestedDeal,
      proposedNote: synthesis.proposedNote,
      confidence: synthesis.confidence,
      allDeals: threadDeals,
    });
  }

  return items;
}

export async function approveQueueItem(threadId: string, dealId: string, noteText: string): Promise<void> {
  await postDealNote(dealId, noteText);
  const state = loadState();
  state.reviewed.add(threadId);
  saveState(state.reviewed, state.skipped);
}

export async function skipQueueItem(threadId: string): Promise<void> {
  const state = loadState();
  state.skipped.add(threadId);
  saveState(state.reviewed, state.skipped);
}

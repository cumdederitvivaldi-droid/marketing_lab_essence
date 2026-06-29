import { BigQuery } from '@google-cloud/bigquery';
import { existsSync } from 'fs';
import { google } from 'googleapis';
import { homedir } from 'os';
import path from 'path';
import type {
  BqOnlyEvent,
  EventComment,
  EventDefinition,
  EventDictionaryData,
} from './types';

const DEFAULT_SHEET_ID = '1-v4gyRD9yzzNDqy5NwjDj02uJQZItM-R8EGE88-1diQ';
const DEFAULT_SHEET_GID = 1531837284;
const SHEET_ID = process.env.EVENT_DICTIONARY_SHEET_ID ?? DEFAULT_SHEET_ID;
const SHEET_GID = Number(process.env.EVENT_DICTIONARY_SHEET_GID ?? String(DEFAULT_SHEET_GID));
const PROJECT_ID = process.env.EVENT_DICTIONARY_BQ_PROJECT ?? 'covering-app-ccd23';
const TABLE_ID = process.env.EVENT_DICTIONARY_BQ_TABLE ?? 'covering-app-ccd23.mixpanel.mp_master_event';
const DEFAULT_SHEETS_CREDENTIALS = path.join(homedir(), '.config/gcloud/sheets-service-account.json');
const BQ_QUERY_LIMIT = 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const COMMENT_AUTHORS = ['자현', '예진', '나연', '인준'];

interface CacheEntry {
  expiresAt: number;
  data: EventDictionaryData;
}

interface SheetResult {
  rows: string[][];
  title: string;
}

interface BqCountRow {
  name: string;
  count: number;
}

let cache: CacheEntry | null = null;
let inFlightData: Promise<EventDictionaryData> | null = null;

export async function getEventDictionaryData(): Promise<EventDictionaryData> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.data;
  }

  if (inFlightData) {
    return inFlightData;
  }

  inFlightData = loadEventDictionaryData();

  try {
    return await inFlightData;
  } finally {
    inFlightData = null;
  }
}

async function loadEventDictionaryData(): Promise<EventDictionaryData> {
  const warnings: string[] = [];
  let sheetTitle: string | null = null;
  let events: EventDefinition[] = [];

  try {
    const sheet = await fetchSheetRows();
    sheetTitle = sheet.title;
    events = parseSheetRows(sheet.rows);
  } catch (error) {
    warnings.push(`Google Sheet 조회 실패: ${formatError(error)}`);
  }

  let bqRows: BqCountRow[] = [];
  try {
    bqRows = await fetchBqCounts();
  } catch (error) {
    warnings.push(`BigQuery 최근 7일 발화 수 조회 실패: ${formatError(error)}`);
  }

  const { countByEventName, bqOnlyEvents } = reconcileBqCounts(events, bqRows);
  const enrichedEvents = events.map((event) => ({
    ...event,
    count7d: countByEventName.get(event.name) ?? 0,
  }));

  const data: EventDictionaryData = {
    events: enrichedEvents,
    bqOnlyEvents,
    warnings,
    updatedAt: new Date().toISOString(),
    sheetTitle,
  };

  cache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data,
  };

  return data;
}

async function fetchSheetRows(): Promise<SheetResult> {
  const auth = createSheetsAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
    fields: 'sheets(properties(sheetId,title))',
  });
  const matchedSheet = metadata.data.sheets?.find((sheet) => sheet.properties?.sheetId === SHEET_GID);
  const title = matchedSheet?.properties?.title;

  if (!title) {
    throw new Error(`gid=${SHEET_GID} 시트를 찾지 못했습니다`);
  }

  const values = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${quoteSheetTitle(title)}!A:J`,
  });

  return {
    rows: (values.data.values ?? []) as string[][],
    title,
  };
}

async function fetchBqCounts(): Promise<BqCountRow[]> {
  const bigquery = createBigQueryClient();
  const query = `
    SELECT event_name, COUNT(*) AS cnt
    FROM \`${TABLE_ID}\`
    WHERE DATE(time, 'Asia/Seoul') >= DATE_SUB(CURRENT_DATE('Asia/Seoul'), INTERVAL 7 DAY)
      AND NOT STARTS_WITH(event_name, '$')
      AND NOT STARTS_WITH(event_name, '[Airbridge]')
    GROUP BY event_name
    ORDER BY cnt DESC
    LIMIT ${BQ_QUERY_LIMIT}
  `;

  const [rows] = await bigquery.query({ query, useLegacySql: false });

  return (rows as Array<{ event_name?: unknown; cnt?: unknown }>)
    .map((row) => ({
      name: String(row.event_name ?? '').trim(),
      count: toNumber(row.cnt),
    }))
    .filter((row) => row.name.length > 0);
}

function createSheetsAuth() {
  const explicitCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const keyFile = explicitCredentials && existsSync(explicitCredentials)
    ? explicitCredentials
    : existsSync(DEFAULT_SHEETS_CREDENTIALS)
      ? DEFAULT_SHEETS_CREDENTIALS
      : undefined;

  return new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

function createBigQueryClient() {
  const keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS_BQ;

  if (keyFilename && existsSync(keyFilename)) {
    return new BigQuery({ projectId: PROJECT_ID, keyFilename });
  }

  return new BigQuery({ projectId: PROJECT_ID });
}

function parseSheetRows(rows: string[][]): EventDefinition[] {
  if (rows.length === 0) {
    return [];
  }

  const events: EventDefinition[] = [];
  let currentCategory = '미분류';
  let currentOwner = '';

  rows.slice(1).forEach((row, rowIndex) => {
    const owner = getCell(row, 0);
    const category = getCell(row, 1);
    const namesCell = getCell(row, 2);

    if (owner) {
      currentOwner = owner;
    }
    if (category) {
      currentCategory = category;
    }
    if (!namesCell) {
      return;
    }

    const eventNames = splitMultiline(namesCell);
    const descriptions = splitMultiline(getCell(row, 3));
    const properties = getCell(row, 5);
    const comments = parseComments(row);

    eventNames.forEach((nameLine, eventIndex) => {
      const parsed = parseEventName(nameLine);
      if (!parsed.name) {
        return;
      }

      events.push({
        id: `${rowIndex}-${eventIndex}-${parsed.name}`,
        category: currentCategory,
        owner: currentOwner,
        type: parsed.type,
        name: parsed.name,
        description: descriptions[eventIndex] ?? '',
        properties: eventIndex === 0 ? properties : '',
        comments: eventIndex === 0 ? comments : [],
        count7d: 0,
      });
    });
  });

  return events;
}

function parseComments(row: string[]): EventComment[] {
  return COMMENT_AUTHORS.flatMap((author, index) => {
    const text = getCell(row, 6 + index);
    return text ? [{ author, text }] : [];
  });
}

function reconcileBqCounts(events: EventDefinition[], rows: BqCountRow[]) {
  const sheetEventNames = new Set(events.map((event) => event.name));
  const countByEventName = new Map<string, number>();
  const bqOnlyByName = new Map<string, BqOnlyEvent>();

  rows.forEach((row) => {
    const parsed = parseEventName(row.name);
    const normalizedName = parsed.name;

    countByEventName.set(
      normalizedName,
      (countByEventName.get(normalizedName) ?? 0) + row.count,
    );

    if (!sheetEventNames.has(normalizedName) && !row.name.startsWith('[PATH]')) {
      bqOnlyByName.set(row.name, {
        name: row.name,
        normalizedName,
        type: parsed.type,
        count7d: row.count,
      });
    }
  });

  const bqOnlyEvents = Array.from(bqOnlyByName.values()).sort((a, b) => {
    if (b.count7d !== a.count7d) {
      return b.count7d - a.count7d;
    }
    return a.name.localeCompare(b.name, 'ko-KR');
  });

  return { countByEventName, bqOnlyEvents };
}

function parseEventName(value: string) {
  const matched = value.match(/^\[(\w+)]\s*(.*)$/);
  if (!matched) {
    return { type: 'EVENT', name: value.trim() };
  }

  return {
    type: matched[1].toUpperCase(),
    name: matched[2].trim(),
  };
}

function getCell(row: string[], index: number) {
  return (row[index] ?? '').trim();
}

function splitMultiline(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function quoteSheetTitle(title: string) {
  return `'${title.replace(/'/g, "''")}'`;
}

function toNumber(value: unknown) {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return Number(value);
  }
  if (value && typeof value === 'object' && 'value' in value) {
    return Number((value as { value: string }).value);
  }
  return 0;
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export interface EventComment {
  author: string;
  text: string;
}

export interface EventDefinition {
  id: string;
  category: string;
  owner: string;
  type: string;
  name: string;
  description: string;
  properties: string;
  comments: EventComment[];
  count7d: number;
}

export interface BqOnlyEvent {
  name: string;
  normalizedName: string;
  type: string;
  count7d: number;
}

export interface EventDictionaryData {
  events: EventDefinition[];
  bqOnlyEvents: BqOnlyEvent[];
  warnings: string[];
  updatedAt: string;
  sheetTitle: string | null;
}

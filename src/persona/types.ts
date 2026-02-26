export interface Demographics {
  age: number | null;
  gender: string | null;
  education: string | null;
  marital_status: string | null;
  income: number | null;
  race: string | null;
  occupation: string | null;
  region: string | null;
  kids: number | null;
  household_size: number | null;
}

export interface Persona {
  id?: number;
  experimentId: number;
  seedRecordId: number;
  modelId: string;
  backstory: string;
  demographics: Demographics;
  rawData: Record<string, unknown>;
}

export interface SeedRecord {
  id: number;
  dataset: string;
  age: number | null;
  gender: string | null;
  education: string | null;
  marital_status: string | null;
  income: number | null;
  race: string | null;
  occupation: string | null;
  region: string | null;
  kids: number | null;
  household_size: number | null;
  raw_json: string;
}

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { DATASET_DIR } from '../../config.js';

export interface KaggleRecord {
  Year_Birth: number;
  Education: string;
  Marital_Status: string;
  Income: number;
  Kidhome: number;
  Teenhome: number;
  MntWines: number;
  MntFruits: number;
  MntMeatProducts: number;
  MntFishProducts: number;
  MntSweetProducts: number;
  MntGoldProds: number;
  NumDealsPurchases: number;
  NumWebPurchases: number;
  NumCatalogPurchases: number;
  NumStorePurchases: number;
  Response: number;
}

function normalizeEducation(edu: string): string {
  const map: Record<string, string> = {
    'Graduation': 'bachelors',
    'PhD': 'doctorate',
    'Master': 'masters',
    '2n Cycle': 'masters',
    'Basic': 'high_school',
  };
  return map[edu] || 'other';
}

function normalizeMarital(status: string): string {
  const map: Record<string, string> = {
    'Single': 'single',
    'Together': 'partnered',
    'Married': 'married',
    'Divorced': 'divorced',
    'Widow': 'widowed',
    'Alone': 'single',
    'Absurd': 'single',
    'YOLO': 'single',
  };
  return map[status] || 'other';
}

export function parseKaggle(): Array<{
  normalized: Record<string, unknown>;
  raw: KaggleRecord;
}> {
  const filePath = path.join(DATASET_DIR, 'kaggle', 'marketing_campaign.csv');
  if (!fs.existsSync(filePath)) {
    console.warn(`Kaggle dataset not found at ${filePath}`);
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const records: KaggleRecord[] = parse(content, {
    delimiter: '\t',
    columns: true,
    skip_empty_lines: true,
    trim: true,
    cast: (value, context) => {
      if (context.header) return value;
      if (['Education', 'Marital_Status', 'Dt_Customer'].includes(context.column as string)) return value;
      const num = Number(value);
      return isNaN(num) ? value : num;
    },
  });

  const currentYear = new Date().getFullYear();
  return records
    .filter(r => r.Income && r.Income > 0 && r.Year_Birth > 1920)
    .map(r => ({
      normalized: {
        age: currentYear - r.Year_Birth,
        gender: null, // not in dataset
        education: normalizeEducation(r.Education),
        marital_status: normalizeMarital(r.Marital_Status),
        income: r.Income,
        race: null, // not in dataset
        occupation: null, // not in dataset
        region: null, // not in dataset
        kids: r.Kidhome + r.Teenhome,
        household_size: null, // not directly available
      },
      raw: r,
    }));
}

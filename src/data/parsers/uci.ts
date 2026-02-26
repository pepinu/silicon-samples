import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { DATASET_DIR } from '../../config.js';

/**
 * UCI Adult Census Income dataset parser.
 * 48,842 rows. Columns: age, workclass, fnlwgt, education, education-num,
 * marital-status, occupation, relationship, race, sex, capital-gain,
 * capital-loss, hours-per-week, native-country, income (>50K or <=50K)
 */

const COLUMNS = [
  'age', 'workclass', 'fnlwgt', 'education', 'education_num',
  'marital_status', 'occupation', 'relationship', 'race', 'sex',
  'capital_gain', 'capital_loss', 'hours_per_week', 'native_country', 'income',
];

function normalizeEducation(edu: string): string {
  const map: Record<string, string> = {
    'Bachelors': 'bachelors',
    'Some-college': 'some_college',
    'HS-grad': 'high_school',
    '11th': 'high_school',
    'Masters': 'masters',
    '9th': 'less_than_hs',
    'Doctorate': 'doctorate',
    'Assoc-acdm': 'associates',
    'Assoc-voc': 'associates',
    'Prof-school': 'professional',
    '7th-8th': 'less_than_hs',
    '5th-6th': 'less_than_hs',
    '10th': 'high_school',
    '1st-4th': 'less_than_hs',
    'Preschool': 'less_than_hs',
    '12th': 'high_school',
  };
  return map[edu.trim()] || 'other';
}

function normalizeMarital(status: string): string {
  const s = status.trim();
  if (s.includes('Married')) return 'married';
  if (s === 'Never-married') return 'single';
  if (s === 'Divorced') return 'divorced';
  if (s === 'Separated') return 'separated';
  if (s === 'Widowed') return 'widowed';
  return 'other';
}

function normalizeRace(race: string): string {
  const map: Record<string, string> = {
    'White': 'white',
    'Black': 'black',
    'Asian-Pac-Islander': 'asian',
    'Amer-Indian-Eskimo': 'native_american',
    'Other': 'other',
  };
  return map[race.trim()] || 'other';
}

function normalizeOccupation(occ: string): string {
  return occ.trim().replace(/[- ]/g, '_').toLowerCase();
}

function estimateIncome(incomeLabel: string, hoursPerWeek: number): number {
  // Rough income estimation based on the >50K / <=50K label and hours
  const base = incomeLabel.trim() === '>50K' ? 72000 : 32000;
  // Add some variation based on hours
  const hourFactor = hoursPerWeek / 40;
  return Math.round(base * hourFactor * (0.8 + Math.random() * 0.4));
}

export function parseUCI(): Array<{
  normalized: Record<string, unknown>;
  raw: Record<string, unknown>;
}> {
  // Try both possible filenames
  const possibleNames = ['adult.data', 'adult.csv'];
  let filePath = '';
  for (const name of possibleNames) {
    const fp = path.join(DATASET_DIR, 'uci', name);
    if (fs.existsSync(fp)) { filePath = fp; break; }
  }

  if (!filePath) {
    console.warn('UCI Adult dataset not found in datasets/uci/');
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, {
    delimiter: ',',
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as string[][];

  return records
    .filter(row => row.length >= 15 && row[0] !== '' && !row[0].startsWith('|'))
    .map(row => {
      const raw: Record<string, unknown> = {};
      COLUMNS.forEach((col, i) => { raw[col] = row[i]?.trim(); });

      const age = parseInt(raw.age as string);
      const hoursPerWeek = parseInt(raw.hours_per_week as string);

      return {
        normalized: {
          age: isNaN(age) ? null : age,
          gender: (raw.sex as string)?.toLowerCase() === 'female' ? 'female' : 'male',
          education: normalizeEducation(raw.education as string || ''),
          marital_status: normalizeMarital(raw.marital_status as string || ''),
          income: estimateIncome(raw.income as string || '<=50K', isNaN(hoursPerWeek) ? 40 : hoursPerWeek),
          race: normalizeRace(raw.race as string || ''),
          occupation: normalizeOccupation(raw.occupation as string || '?'),
          region: null, // not in dataset
          kids: null,
          household_size: null,
        },
        raw,
      };
    })
    .filter(r => r.normalized.age !== null);
}

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { DATASET_DIR } from '../../config.js';

/**
 * BLS Consumer Expenditure Survey - Interview Survey (FMLI) parser.
 * Uses the family-level files (fmli*.csv) which contain demographics + spending.
 * ~6000-7000 consumer units per quarter, 500+ columns.
 *
 * Key fields used:
 * Demographics: AGE_REF, SEX_REF, EDUC_REF, MARITAL1, FAM_SIZE, RACE2, REGION, FINCBTAX
 * Spending: FOODPQ/CQ, ALCBEVPQ/CQ, HOUSPQ/CQ, TRANSPQ/CQ, HEALTHPQ/CQ, ENTERTPQ/CQ, EDUCAPQ/CQ, etc.
 */

function normalizeEducation(code: string): string {
  const num = parseInt(code);
  // BLS education codes
  if (num <= 8) return 'less_than_hs';
  if (num <= 12) return 'high_school';
  if (num === 13) return 'some_college';
  if (num === 14) return 'associates';
  if (num === 15) return 'bachelors';
  if (num === 16) return 'masters';
  if (num === 17) return 'professional';
  return 'other';
}

function normalizeMarital(code: string): string {
  const map: Record<string, string> = {
    '1': 'married',
    '2': 'widowed',
    '3': 'divorced',
    '4': 'separated',
    '5': 'single',
  };
  return map[code.trim()] || 'other';
}

function normalizeRace(code: string): string {
  const map: Record<string, string> = {
    '1': 'white',
    '2': 'black',
    '3': 'native_american',
    '4': 'asian',
    '5': 'pacific_islander',
    '6': 'multi_racial',
  };
  return map[code.trim()] || 'other';
}

function normalizeRegion(code: string): string {
  const map: Record<string, string> = {
    '1': 'northeast',
    '2': 'midwest',
    '3': 'south',
    '4': 'west',
  };
  return map[code.trim()] || 'other';
}

function safeNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '' || val === '.') return null;
  const str = String(val).replace(/,/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

export function parseBLS(): Array<{
  normalized: Record<string, unknown>;
  raw: Record<string, unknown>;
}> {
  const intrvwDir = path.join(DATASET_DIR, 'bls', 'intrvw24');
  if (!fs.existsSync(intrvwDir)) {
    console.warn('BLS interview data not found at datasets/bls/intrvw24/');
    return [];
  }

  // Find all fmli*.csv files
  const fmliFiles = fs.readdirSync(intrvwDir).filter(f => f.startsWith('fmli') && f.endsWith('.csv'));
  if (fmliFiles.length === 0) {
    console.warn('No FMLI files found');
    return [];
  }

  const allRecords: Array<{ normalized: Record<string, unknown>; raw: Record<string, unknown> }> = [];

  for (const file of fmliFiles) {
    const filePath = path.join(intrvwDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    let records: Record<string, string>[];
    try {
      records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (err) {
      console.warn(`Failed to parse ${file}:`, (err as Error).message);
      continue;
    }

    for (const row of records) {
      const age = safeNum(row.AGE_REF);
      if (!age || age < 16 || age > 100) continue;

      const income = safeNum(row.FINCBTAX);

      // Build spending object
      const spending: Record<string, number | null> = {
        food: add(safeNum(row.FOODPQ), safeNum(row.FOODCQ)),
        food_home: add(safeNum(row.FDHOMEPQ), safeNum(row.FDHOMECQ)),
        food_away: add(safeNum(row.FDAWAYPQ), safeNum(row.FDAWAYCQ)),
        alcohol: add(safeNum(row.ALCBEVPQ), safeNum(row.ALCBEVCQ)),
        housing: add(safeNum(row.HOUSPQ), safeNum(row.HOUSCQ)),
        transport: add(safeNum(row.TRANSPQ), safeNum(row.TRANSCQ)),
        health: add(safeNum(row.HEALTHPQ), safeNum(row.HEALTHCQ)),
        entertainment: add(safeNum(row.ENTERTPQ), safeNum(row.ENTERTCQ)),
        education: add(safeNum(row.EDUCAPQ), safeNum(row.EDUCACQ)),
        apparel: add(safeNum(row.APPARPQ), safeNum(row.APPARCQ)),
        total: add(safeNum(row.TOTEXPPQ), safeNum(row.TOTEXPCQ)),
      };

      const sex = row.SEX_REF?.trim();
      const gender = sex === '1' ? 'male' : sex === '2' ? 'female' : null;

      allRecords.push({
        normalized: {
          age,
          gender,
          education: normalizeEducation(row.EDUC_REF || ''),
          marital_status: normalizeMarital(row.MARITAL1 || ''),
          income,
          race: normalizeRace(row.RACE2 || row.REF_RACE || ''),
          occupation: null,
          region: normalizeRegion(row.REGION || ''),
          kids: safeNum(row.PERSLT18),
          household_size: safeNum(row.FAM_SIZE),
        },
        raw: { ...spending, NEWID: row.NEWID, QINTRVMO: row.QINTRVMO, QINTRVYR: row.QINTRVYR },
      });
    }
  }

  console.log(`Parsed ${allRecords.length} records from ${fmliFiles.length} BLS FMLI files`);
  return allRecords;
}

function add(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a || 0) + (b || 0);
}

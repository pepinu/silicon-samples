import type { Demographics } from './types.js';

export type BackstoryMode = 'first-person' | 'third-person';

/**
 * Template-based backstory generation.
 * Research shows census-derived backstories outperform LLM-generated ones
 * (Moon et al. 2026, Argyle et al.).
 *
 * Modes:
 * - first-person: "I am a 27-year-old female..." (original, used in experiments 1-12)
 * - third-person: "This person is a 27-year-old female..." (Chapala et al. 2025 finding:
 *   consistent third-person framing reduces social desirability bias by ~24%)
 */
export function buildBackstory(
  demographics: Demographics,
  rawData: Record<string, unknown>,
  mode: BackstoryMode = 'first-person',
): string {
  const p3 = mode === 'third-person';
  // In third-person, use "This person" as subject (takes singular verbs)
  const subj = p3 ? 'This person' : 'I';
  const verb = p3 ? 'is' : 'am';
  const have = p3 ? 'has' : 'have';
  const poss = p3 ? 'Their' : 'My';
  // For subsequent sentences, alternate "This person" / "They" for natural flow
  // "This person" takes singular verbs; using it consistently avoids "they prefers" errors
  const sp = p3 ? 'This person' : 'I'; // sentence-start subject (singular)
  const live = p3 ? 'lives' : 'live';
  const work = p3 ? 'works' : 'work';

  const parts: string[] = [];

  // Opening
  const age = demographics.age;
  const gender = demographics.gender;
  if (age) {
    parts.push(`${subj} ${verb} a ${age}-year-old${gender ? ` ${gender}` : ''}.`);
  }

  // Education
  const eduMap: Record<string, string> = {
    high_school: `${subj} ${have} a high school education`,
    some_college: `${subj} attended some college`,
    associates: `${subj} ${have} an associate's degree`,
    bachelors: `${subj} ${have} a bachelor's degree`,
    masters: `${subj} ${have} a master's degree`,
    doctorate: `${subj} ${have} a doctoral degree`,
    professional: `${subj} ${have} a professional degree`,
  };
  if (demographics.education && eduMap[demographics.education]) {
    parts.push(eduMap[demographics.education] + '.');
  }

  // Marital status
  const maritalMap: Record<string, string> = {
    single: `${subj} ${verb} single`,
    married: `${subj} ${verb} married`,
    partnered: `${subj} ${live} with ${p3 ? 'their' : 'my'} partner`,
    divorced: `${subj} ${verb} divorced`,
    widowed: `${subj} ${verb} widowed`,
    separated: `${subj} ${verb} separated`,
  };
  if (demographics.marital_status && maritalMap[demographics.marital_status]) {
    let m = maritalMap[demographics.marital_status];
    if (demographics.kids && demographics.kids > 0) {
      m += ` with ${demographics.kids} ${demographics.kids === 1 ? 'child' : 'children'}`;
    }
    parts.push(m + '.');
  }

  // Income
  if (demographics.income) {
    const income = demographics.income;
    let bracket: string;
    if (income < 25000) bracket = 'a lower income';
    else if (income < 50000) bracket = 'a modest income';
    else if (income < 75000) bracket = 'a moderate income';
    else if (income < 100000) bracket = 'a good income';
    else if (income < 150000) bracket = 'a high income';
    else bracket = 'a very high income';
    parts.push(`${poss} household earns ${bracket} of about $${Math.round(income / 1000)}K per year.`);
  }

  // Occupation
  if (demographics.occupation) {
    parts.push(`${sp} ${work} as ${demographics.occupation}.`);
  }

  // Race/ethnicity
  if (demographics.race) {
    parts.push(`${sp} identif${p3 ? 'ies' : 'y'} as ${demographics.race}.`);
  }

  // Region
  if (demographics.region) {
    parts.push(`${sp} ${live} in the ${demographics.region}.`);
  }

  // Spending patterns (Kaggle-specific)
  if (rawData.MntWines !== undefined) {
    const totalSpend = (
      (rawData.MntWines as number || 0) +
      (rawData.MntFruits as number || 0) +
      (rawData.MntMeatProducts as number || 0) +
      (rawData.MntFishProducts as number || 0) +
      (rawData.MntSweetProducts as number || 0) +
      (rawData.MntGoldProds as number || 0)
    );
    if (totalSpend > 1500) {
      parts.push(`${sp} ${verb} a relatively high spender on food and consumer goods.`);
    } else if (totalSpend > 500) {
      parts.push(`${sp} ${verb} a moderate spender on food and consumer goods.`);
    } else {
      parts.push(`${sp} ${verb} careful with ${p3 ? 'their' : 'my'} spending on food and consumer goods.`);
    }

    // Shopping preferences
    const web = rawData.NumWebPurchases as number || 0;
    const store = rawData.NumStorePurchases as number || 0;
    if (web > store * 1.5) {
      parts.push(`${sp} prefer${p3 ? 's' : ''} shopping online.`);
    } else if (store > web * 1.5) {
      parts.push(`${sp} prefer${p3 ? 's' : ''} shopping in physical stores.`);
    } else {
      parts.push(`${sp} shop${p3 ? 's' : ''} both online and in stores.`);
    }
  }

  // BLS-specific spending patterns
  if (rawData.FOODPQ !== undefined) {
    const foodHome = (rawData.FDHOMEPQ as number || 0) + (rawData.FDHOMECQ as number || 0);
    const foodAway = (rawData.FDAWAYPQ as number || 0) + (rawData.FDAWAYCQ as number || 0);
    if (foodAway > foodHome) {
      parts.push(`${sp} tend${p3 ? 's' : ''} to eat out more than ${p3 ? 'they cook' : 'I cook'} at home.`);
    } else if (foodHome > foodAway * 3) {
      parts.push(`${sp} mostly cook${p3 ? 's' : ''} and eat${p3 ? 's' : ''} at home.`);
    }
  }

  return parts.join(' ');
}

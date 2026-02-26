import type { Demographics } from './types.js';

/**
 * Template-based first-person backstory generation.
 * Research shows census-derived backstories outperform LLM-generated ones
 * (Moon et al. 2026, Argyle et al.).
 */
export function buildBackstory(demographics: Demographics, rawData: Record<string, unknown>): string {
  const parts: string[] = [];

  // Opening
  const age = demographics.age;
  const gender = demographics.gender;
  if (age) {
    parts.push(`I am a ${age}-year-old${gender ? ` ${gender}` : ''}.`);
  }

  // Education
  const eduMap: Record<string, string> = {
    high_school: 'I have a high school education',
    some_college: 'I attended some college',
    associates: 'I have an associate\'s degree',
    bachelors: 'I have a bachelor\'s degree',
    masters: 'I have a master\'s degree',
    doctorate: 'I have a doctoral degree',
    professional: 'I have a professional degree',
  };
  if (demographics.education && eduMap[demographics.education]) {
    parts.push(eduMap[demographics.education] + '.');
  }

  // Marital status
  const maritalMap: Record<string, string> = {
    single: 'I am single',
    married: 'I am married',
    partnered: 'I live with my partner',
    divorced: 'I am divorced',
    widowed: 'I am widowed',
    separated: 'I am separated',
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
    parts.push(`My household earns ${bracket} of about $${Math.round(income / 1000)}K per year.`);
  }

  // Occupation
  if (demographics.occupation) {
    parts.push(`I work as ${demographics.occupation}.`);
  }

  // Race/ethnicity
  if (demographics.race) {
    parts.push(`I identify as ${demographics.race}.`);
  }

  // Region
  if (demographics.region) {
    parts.push(`I live in the ${demographics.region}.`);
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
      parts.push('I am a relatively high spender on food and consumer goods.');
    } else if (totalSpend > 500) {
      parts.push('I am a moderate spender on food and consumer goods.');
    } else {
      parts.push('I am careful with my spending on food and consumer goods.');
    }

    // Shopping preferences
    const web = rawData.NumWebPurchases as number || 0;
    const store = rawData.NumStorePurchases as number || 0;
    if (web > store * 1.5) {
      parts.push('I prefer shopping online.');
    } else if (store > web * 1.5) {
      parts.push('I prefer shopping in physical stores.');
    } else {
      parts.push('I shop both online and in stores.');
    }
  }

  // BLS-specific spending patterns
  if (rawData.FOODPQ !== undefined) {
    const foodHome = (rawData.FDHOMEPQ as number || 0) + (rawData.FDHOMECQ as number || 0);
    const foodAway = (rawData.FDAWAYPQ as number || 0) + (rawData.FDAWAYCQ as number || 0);
    if (foodAway > foodHome) {
      parts.push('I tend to eat out more than I cook at home.');
    } else if (foodHome > foodAway * 3) {
      parts.push('I mostly cook and eat at home.');
    }
  }

  return parts.join(' ');
}

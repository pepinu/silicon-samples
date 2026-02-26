export interface Question {
  id: string;
  text: string;
  type: 'likert' | 'multiple_choice' | 'numeric' | 'open_ended';
  options?: string[];
  scale?: { min: number; max: number; labels?: Record<number, string> };
  followUp?: string; // optional "why?" probe
  dimension?: string; // which demographic/behavioral dimension this validates against
}

export interface QuestionSet {
  id: string;
  name: string;
  description: string;
  questions: Question[];
}

export const BUILT_IN_QUESTION_SETS: QuestionSet[] = [
  {
    id: 'consumer_preferences',
    name: 'Consumer Preferences',
    description: 'Questions about shopping habits, brand preferences, and spending behavior',
    questions: [
      {
        id: 'cp_grocery_budget',
        text: 'How much does your household typically spend on groceries per month?',
        type: 'multiple_choice',
        options: ['Under $200', '$200-$400', '$400-$600', '$600-$800', 'Over $800'],
        followUp: 'What factors most influence how much you spend on groceries?',
        dimension: 'income',
      },
      {
        id: 'cp_online_preference',
        text: 'On a scale of 1-7, how much do you prefer shopping online versus in physical stores? (1 = strongly prefer stores, 7 = strongly prefer online)',
        type: 'likert',
        scale: { min: 1, max: 7, labels: { 1: 'Strongly prefer stores', 4: 'No preference', 7: 'Strongly prefer online' } },
        followUp: 'What drives your preference for that shopping channel?',
        dimension: 'age',
      },
      {
        id: 'cp_brand_loyalty',
        text: 'On a scale of 1-7, how loyal are you to specific brands? (1 = always try new brands, 7 = always buy the same brands)',
        type: 'likert',
        scale: { min: 1, max: 7 },
        followUp: 'Can you give an example of a brand you\'re particularly loyal or disloyal to, and why?',
      },
      {
        id: 'cp_impulse_buying',
        text: 'How often do you make impulse purchases?',
        type: 'multiple_choice',
        options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Very often'],
        dimension: 'income',
      },
      {
        id: 'cp_price_sensitivity',
        text: 'On a scale of 1-7, how important is price when making purchase decisions? (1 = not at all, 7 = extremely important)',
        type: 'likert',
        scale: { min: 1, max: 7 },
        followUp: 'Describe a recent purchase where price was or wasn\'t the main factor.',
        dimension: 'income',
      },
      {
        id: 'cp_sustainable_premium',
        text: 'Would you pay more for a product that is sustainably produced?',
        type: 'multiple_choice',
        options: ['No, price is what matters', 'Maybe, up to 10% more', 'Yes, up to 25% more', 'Yes, up to 50% more', 'Yes, regardless of cost'],
        followUp: 'What does "sustainability" mean to you in the context of consumer products?',
        dimension: 'education',
      },
      {
        id: 'cp_ad_influence',
        text: 'On a scale of 1-7, how much do advertisements influence your purchasing decisions? (1 = not at all, 7 = very strongly)',
        type: 'likert',
        scale: { min: 1, max: 7 },
        dimension: 'age',
      },
      {
        id: 'cp_dining_frequency',
        text: 'How many times per week does your household eat meals prepared outside the home (restaurants, takeout, delivery)?',
        type: 'numeric',
        scale: { min: 0, max: 21 },
        followUp: 'What typically drives your decision to eat out versus cook at home?',
        dimension: 'income',
      },
    ],
  },
  {
    id: 'financial_attitudes',
    name: 'Financial Attitudes',
    description: 'Questions about saving, spending priorities, and financial outlook',
    questions: [
      {
        id: 'fa_saving_rate',
        text: 'What percentage of your income do you typically save each month?',
        type: 'multiple_choice',
        options: ['0% (living paycheck to paycheck)', '1-5%', '6-10%', '11-20%', 'Over 20%'],
        dimension: 'income',
      },
      {
        id: 'fa_financial_stress',
        text: 'On a scale of 1-7, how stressed do you feel about your financial situation? (1 = not at all stressed, 7 = extremely stressed)',
        type: 'likert',
        scale: { min: 1, max: 7 },
        followUp: 'What aspect of your finances causes the most stress?',
        dimension: 'income',
      },
      {
        id: 'fa_spending_priority',
        text: 'Which category do you most prioritize when allocating discretionary income?',
        type: 'multiple_choice',
        options: ['Experiences (travel, dining, events)', 'Things (electronics, clothes, home)', 'Savings/investments', 'Education/self-improvement', 'Family/children'],
        dimension: 'marital_status',
      },
      {
        id: 'fa_debt_comfort',
        text: 'On a scale of 1-7, how comfortable are you with carrying debt (credit cards, loans)? (1 = very uncomfortable, 7 = very comfortable)',
        type: 'likert',
        scale: { min: 1, max: 7 },
        dimension: 'education',
      },
      {
        id: 'fa_retirement_confidence',
        text: 'How confident are you that you\'ll have enough money for a comfortable retirement?',
        type: 'multiple_choice',
        options: ['Not at all confident', 'Slightly confident', 'Somewhat confident', 'Fairly confident', 'Very confident'],
        followUp: 'What is your main retirement planning strategy?',
        dimension: 'age',
      },
      {
        id: 'fa_luxury_spending',
        text: 'How much do you typically spend on luxury or non-essential items per month?',
        type: 'multiple_choice',
        options: ['Under $50', '$50-$150', '$150-$300', '$300-$500', 'Over $500'],
        dimension: 'income',
      },
      {
        id: 'fa_financial_goals',
        text: 'On a scale of 1-7, how well-defined are your financial goals? (1 = no clear goals, 7 = very detailed plan)',
        type: 'likert',
        scale: { min: 1, max: 7 },
        dimension: 'education',
      },
      {
        id: 'fa_economic_outlook',
        text: 'How optimistic are you about the economy over the next 12 months?',
        type: 'multiple_choice',
        options: ['Very pessimistic', 'Somewhat pessimistic', 'Neutral', 'Somewhat optimistic', 'Very optimistic'],
        followUp: 'What factors most influence your economic outlook?',
      },
    ],
  },
  {
    id: 'technology_adoption',
    name: 'Technology Adoption',
    description: 'Questions about technology usage and attitudes toward innovation',
    questions: [
      {
        id: 'ta_early_adopter',
        text: 'On a scale of 1-7, how quickly do you adopt new technologies? (1 = very late, 7 = very early)',
        type: 'likert',
        scale: { min: 1, max: 7 },
        dimension: 'age',
      },
      {
        id: 'ta_social_media',
        text: 'How many hours per day do you spend on social media?',
        type: 'multiple_choice',
        options: ['I don\'t use social media', 'Less than 1 hour', '1-2 hours', '2-4 hours', 'More than 4 hours'],
        dimension: 'age',
      },
      {
        id: 'ta_ai_comfort',
        text: 'On a scale of 1-7, how comfortable are you with AI making recommendations for you (products, content, etc.)? (1 = very uncomfortable, 7 = very comfortable)',
        type: 'likert',
        scale: { min: 1, max: 7 },
        followUp: 'In what areas do you think AI recommendations are helpful or harmful?',
        dimension: 'education',
      },
      {
        id: 'ta_privacy_concern',
        text: 'On a scale of 1-7, how concerned are you about your online privacy? (1 = not at all, 7 = extremely concerned)',
        type: 'likert',
        scale: { min: 1, max: 7 },
        followUp: 'What steps do you take to protect your online privacy?',
        dimension: 'age',
      },
      {
        id: 'ta_smart_home',
        text: 'How many smart home devices do you own (smart speakers, thermostats, cameras, etc.)?',
        type: 'multiple_choice',
        options: ['None', '1-2', '3-5', '6-10', 'More than 10'],
        dimension: 'income',
      },
      {
        id: 'ta_streaming_services',
        text: 'How many streaming services (Netflix, Spotify, etc.) do you pay for?',
        type: 'numeric',
        scale: { min: 0, max: 20 },
        dimension: 'income',
      },
      {
        id: 'ta_tech_budget',
        text: 'How much do you spend on technology (devices, subscriptions, upgrades) per year?',
        type: 'multiple_choice',
        options: ['Under $200', '$200-$500', '$500-$1000', '$1000-$2000', 'Over $2000'],
        dimension: 'income',
      },
      {
        id: 'ta_digital_payments',
        text: 'On a scale of 1-7, how much do you prefer digital payments (contactless, apps) over cash? (1 = strongly prefer cash, 7 = strongly prefer digital)',
        type: 'likert',
        scale: { min: 1, max: 7 },
        dimension: 'age',
      },
    ],
  },
];

export function getQuestionSet(id: string): QuestionSet | undefined {
  return BUILT_IN_QUESTION_SETS.find(qs => qs.id === id);
}

export function getAllQuestionSets(): QuestionSet[] {
  return BUILT_IN_QUESTION_SETS;
}

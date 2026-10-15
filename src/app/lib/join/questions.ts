// The form's words, in a module the browser may import (join-core.ts uses them in the emails).

export const QUESTIONS = {
  sixMonths: 'What would need to occur over the next 6 months for you to be pleased with yourself?',
  fiveYears: 'What would need to occur over the next 5 years for you to be pleased with yourself?',
  email: 'What is your email (optional)?',
} as const;

export const EMAIL_NOTE =
  "We will use this email if it is different to your account email, or if you are not logged in. If you don't put an email and are not logged in, Github will notify your linked email.";

export const MONEY_NOTE =
  'Exclude all monetary gains or financial targets. If your ambition naturally involves money, state what remains once the money is removed.';

export const MAX_ANSWER = 4000;

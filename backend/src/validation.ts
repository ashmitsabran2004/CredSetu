import { z } from 'zod';

export const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use an international phone number, for example +14155552671');
export const requestOtpSchema = z.object({ phone: phoneSchema });
export const verifyOtpSchema = z.object({ phone: phoneSchema, code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits') });

// Require text so the JSON parser never turns a money value into a binary float.
const amountSchema = z.string().refine(
  (value) => /^\d+(?:\.\d{1,2})?$/.test(value) && /[1-9]/.test(value.replace('.', '')),
  'Amount must be positive with at most 2 decimal places',
);

export const loanSchema = z.object({
  friend_name: z.string().trim().min(1, 'Friend name is required').max(120),
  amount: amountSchema,
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must use YYYY-MM-DD').refine((date) => {
    const parsed = new Date(`${date}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  }, 'Due date must be a valid calendar date'),
});

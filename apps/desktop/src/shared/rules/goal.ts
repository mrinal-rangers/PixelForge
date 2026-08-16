import type { GoalPlan } from '../types'

/**
 * Pure rules for goal plans.
 */

/**
 * Auto mode must still stop for consequential decisions. The plan (or the
 * original request) mentions destructive, sensitive or irreversible actions.
 */
export function planRequiresApproval(
  plan: GoalPlan,
  goalInput?: { request: string; constraints: string[] }
): boolean {
  const haystack = [
    plan.completionCriteria,
    ...plan.risks,
    ...plan.tasks.flatMap((t) => [t.title, t.instructions])
  ]
    .join('\n')
    .toLowerCase()
  const flags = [
    'delete ',
    'drop database',
    'drop table',
    'rm -rf',
    'git reset --hard',
    'force push',
    'production',
    'deploy',
    'publish',
    'credentials',
    'password',
    'secret',
    'api key',
    'payment',
    'charge',
    'refund',
    'irreversible',
    'cannot be undone',
    'paying',
    'money'
  ]
  if (flags.some((flag) => haystack.includes(flag))) {
    return true
  }
  if (goalInput && /\b(delete|remove|drop|purge)\b/i.test(goalInput.request)) {
    return true
  }
  return false
}
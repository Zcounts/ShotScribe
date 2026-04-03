import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval(
  'reconcile due asset hard deletes',
  { hours: 1 },
  internal.assets.runAssetDeleteReconciliation,
  { limit: 50 },
)

crons.interval(
  'reconcile due project hard deletes',
  { hours: 1 },
  internal.projects.runProjectDeleteReconciliation,
  { limit: 20 },
)

export default crons

import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval(
  'reconcile due asset hard deletes',
  { hours: 1 },
  internal.assets.runAssetDeleteReconciliation,
  { limit: 50 },
)

export default crons

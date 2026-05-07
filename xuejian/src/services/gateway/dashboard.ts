import { dashboardSummarySchema } from '@/types'
import type { DashboardSummary } from '@/types'
import { invokeWithSchema } from './index'

export const dashboardGateway = {
  async getSummary(days = 63, limit = 6): Promise<DashboardSummary> {
    return invokeWithSchema('get_dashboard_summary', dashboardSummarySchema, { days, limit })
  },
}

import { Dashboard } from '@apitrail/dashboard'
import '@apitrail/dashboard/styles.css'

export const dynamic = 'force-dynamic'

export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>
}) {
  return <Dashboard params={params} poolConfig={{ ssl: { rejectUnauthorized: false } }} />
}

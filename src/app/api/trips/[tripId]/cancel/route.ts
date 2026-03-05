import { auth } from '@clerk/nextjs/server'
import { ok, err } from '@/lib/response'
import { resolveUserId } from '@/lib/services/clerk.service'
import db from '@/lib/db'

type Params = { params: Promise<{ tripId: string }> }

// ------------------------------------------------------------
//  POST /api/trips/[tripId]/cancel
// ------------------------------------------------------------
export async function POST(_req: Request, { params }: Params) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return err('Unauthorized', 401)

  const { tripId } = await params

  try {
    const userId = await resolveUserId(clerkId)
    if (!userId) return err('User not found', 404)

    const result = await db.query<{ fn_change_trip_status: string }>(
      `SELECT fn_change_trip_status($1, $2, 'CANCEL') AS new_status`,
      [tripId, userId]
    )

    return ok({ new_status: result.rows[0].fn_change_trip_status, trip_id: tripId })

  } catch (error: unknown) {
    console.error('[POST /trips/:tripId/cancel]', error)
    if (error instanceof Error) {
      if (error.message.includes('not found or access denied'))        return err('Trip not found', 404)
      if (error.message.includes('Only DRAFT or CONFIRMED'))           return err(error.message, 400)
    }
    return err('Internal server error', 500)
  }
}
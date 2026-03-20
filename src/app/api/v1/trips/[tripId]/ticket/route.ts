import { auth } from '@clerk/nextjs/server'
import db from '@/lib/db'
import { ok, err } from '@/lib/response'
import { TicketResponseSchema } from '@/lib/schemas/trip.schema'

type Params = { params: Promise<{ tripId: string }> }

export async function GET(
  _req: Request,
  { params }: Params
) {
  try {
    const { tripId } = await params
    const { userId } = await auth()
    if (!userId) return err('No autorizado', 401)

    const userQuery = await db.query(
      'SELECT user_id FROM user_identities WHERE provider_id = $1',
      [userId]
    )
    if (userQuery.rows.length === 0) return err('Usuario no encontrado', 404)
    const internalUserId = userQuery.rows[0].user_id

    const result = await db.query(
      `SELECT * FROM tickets WHERE trip_id = $1 AND user_id = $2`,
      [tripId, internalUserId]
    )

    if (result.rows.length === 0) {
      return err('El ticket aún no tiene datos. Agrega ítems al itinerario.', 404)
    }

    const ticket = TicketResponseSchema.parse(result.rows[0])
    return ok(ticket)
  } catch (e: any) {
    return err(e.message, 500)
  }
}

import { auth } from '@clerk/nextjs/server'
import db from '@/lib/db'
import { ok, err } from '@/lib/response'

type Params = { params: Promise<{ tripId: string; tagId: string }> }

export async function DELETE(
  _req: Request,
  { params }: Params
) {
  try {
    const { tripId, tagId } = await params
    const { userId } = await auth()
    if (!userId) return err('No autorizado', 401)

    const userQuery = await db.query(
      'SELECT user_id FROM user_identities WHERE provider_id = $1',
      [userId]
    )
    if (userQuery.rows.length === 0) return err('Usuario no encontrado', 404)
    const internalUserId = userQuery.rows[0].user_id

    const owns = await db.query(
      'SELECT 1 FROM trips WHERE trip_id = $1 AND user_id = $2',
      [tripId, internalUserId]
    )
    if (owns.rows.length === 0) return err('Viaje no encontrado', 404)

    const result = await db.query(
      `DELETE FROM trip_tags WHERE trip_id = $1 AND tag_id = $2::integer RETURNING trip_id, tag_id`,
      [tripId, tagId]
    )
    if (result.rows.length === 0) return err('Tag no encontrado en este viaje', 404)
    return ok(result.rows[0])
  } catch (e: any) {
    return err(e.message, 500)
  }
}

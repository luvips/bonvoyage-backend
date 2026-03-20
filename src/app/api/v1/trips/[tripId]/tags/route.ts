import { auth } from '@clerk/nextjs/server'
import db from '@/lib/db'
import { ok, err } from '@/lib/response'
import { z } from 'zod'

type Params = { params: Promise<{ tripId: string }> }

async function resolveUser(clerkId: string) {
  const q = await db.query(
    'SELECT user_id FROM user_identities WHERE provider_id = $1',
    [clerkId]
  )
  return q.rows[0]?.user_id ?? null
}

async function verifyTripOwnership(tripId: string, userId: string): Promise<boolean> {
  const q = await db.query(
    'SELECT 1 FROM trips WHERE trip_id = $1 AND user_id = $2',
    [tripId, userId]
  )
  return q.rows.length > 0
}

export async function GET(
  _req: Request,
  { params }: Params
) {
  try {
    const { tripId } = await params
    const { userId } = await auth()
    if (!userId) return err('No autorizado', 401)

    const internalUserId = await resolveUser(userId)
    if (!internalUserId) return err('Usuario no encontrado', 404)

    const owns = await verifyTripOwnership(tripId, internalUserId)
    if (!owns) return err('Viaje no encontrado', 404)

    const result = await db.query(
      `SELECT t.tag_id, t.name, t.category, tt.added_at
       FROM trip_tags tt
       JOIN tags t ON t.tag_id = tt.tag_id
       WHERE tt.trip_id = $1
       ORDER BY tt.added_at ASC`,
      [tripId]
    )
    return ok(result.rows)
  } catch (e: any) {
    return err(e.message, 500)
  }
}

const AddTagBody = z.object({ tag_id: z.number().int().positive() })

export async function POST(
  req: Request,
  { params }: Params
) {
  try {
    const { tripId } = await params
    const { userId } = await auth()
    if (!userId) return err('No autorizado', 401)

    const internalUserId = await resolveUser(userId)
    if (!internalUserId) return err('Usuario no encontrado', 404)

    const owns = await verifyTripOwnership(tripId, internalUserId)
    if (!owns) return err('Viaje no encontrado', 404)

    const body = AddTagBody.safeParse(await req.json())
    if (!body.success) return err(body.error.message, 400)

    const result = await db.query(
      `INSERT INTO trip_tags (trip_id, tag_id)
       VALUES ($1, $2)
       ON CONFLICT (trip_id, tag_id) DO NOTHING
       RETURNING trip_id, tag_id, added_at`,
      [tripId, body.data.tag_id]
    )
    return ok(result.rows[0] ?? { trip_id: tripId, tag_id: body.data.tag_id }, 201)
  } catch (e: any) {
    return err(e.message, 500)
  }
}

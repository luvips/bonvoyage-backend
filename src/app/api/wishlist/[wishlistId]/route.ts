import { auth } from '@clerk/nextjs/server'
import db from '@/lib/db'
import { ok, err } from '@/lib/response'
import { resolveUserId } from '@/lib/services/clerk.service'

type Params = { params: Promise<{ wishlistId: string }> }

// ------------------------------------------------------------
//  DELETE /api/wishlist/[wishlistId]
//  Elimina un destino de la wishlist
// ------------------------------------------------------------
export async function DELETE(_req: Request, { params }: Params) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return err('Unauthorized', 401)

  const { wishlistId } = await params

  try {
    const userId = await resolveUserId(clerkId)
    if (!userId) return err('User not found', 404)

    // Validar ownership antes de eliminar
    const result = await db.query(
      `DELETE FROM wishlist
       WHERE wishlist_id = $1
         AND user_id     = $2
       RETURNING wishlist_id, country, city`,
      [wishlistId, userId]
    )

    if (!result.rows[0]) return err('Wishlist item not found', 404)

    return ok({
      deleted:     true,
      wishlist_id: result.rows[0].wishlist_id,
      city:        result.rows[0].city,
      country:     result.rows[0].country,
    })

  } catch (error) {
    console.error('[DELETE /wishlist/:wishlistId]', error)
    return err('Internal server error', 500)
  }
}
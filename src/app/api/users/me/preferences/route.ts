import { auth } from '@clerk/nextjs/server'
import db from '@/lib/db'
import { ok, err } from '@/lib/response'
import { resolveUserId } from '@/lib/services/clerk.service'
import {
  UpdatePreferencesSchema,
  PreferencesResponseSchema,
} from '@/lib/schemas/user.schema'

// ------------------------------------------------------------
//  GET /api/users/me/preferences
// ------------------------------------------------------------
export async function GET() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return err('Unauthorized', 401)

  try {
    const userId = await resolveUserId(clerkId)
    if (!userId) return err('User not found', 404)

    const result = await db.query(
      `SELECT
         preference_id,
         budget_range,
         dietary_restrictions,
         interests,
         preferred_currency,
         preferred_language,
         email_preferences,
         updated_at
       FROM user_preferences
       WHERE user_id = $1`,
      [userId]
    )

    if (!result.rows[0]) return err('Preferences not found', 404)

    const preferences = PreferencesResponseSchema.parse(result.rows[0])
    return ok(preferences)

  } catch (error) {
    console.error('[GET /users/me/preferences]', error)
    return err('Internal server error', 500)
  }
}

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

// ------------------------------------------------------------
//  PUT /api/users/me/preferences
//  Body: { budget_range?, dietary_restrictions?, interests?,
//          preferred_currency?, preferred_language?, email_preferences? }
// ------------------------------------------------------------
export async function PUT(req: Request) {
  const { userId: clerkId } = await auth()
  if (!clerkId) return err('Unauthorized', 401)

  // Validar body con Zod
  const body   = await req.json()
  const parsed = UpdatePreferencesSchema.safeParse(body)
  if (!parsed.success) {
    return err(parsed.error.flatten().fieldErrors as unknown as string, 400)
  }

  const {
    budget_range,
    dietary_restrictions,
    interests,
    preferred_currency,
    preferred_language,
    email_preferences,
  } = parsed.data

  try {
    const userId = await resolveUserId(clerkId)
    if (!userId) return err('User not found', 404)

    const result = await db.query(
      `UPDATE user_preferences
       SET
         budget_range         = COALESCE($1::jsonb, budget_range),
         dietary_restrictions = COALESCE($2::jsonb, dietary_restrictions),
         interests            = COALESCE($3::jsonb, interests),
         preferred_currency   = COALESCE($4,        preferred_currency),
         preferred_language   = COALESCE($5,        preferred_language),
         email_preferences    = COALESCE($6::jsonb, email_preferences),
         updated_at           = NOW()
       WHERE user_id = $7
       RETURNING
         preference_id,
         budget_range,
         dietary_restrictions,
         interests,
         preferred_currency,
         preferred_language,
         email_preferences,
         updated_at`,
      [
        budget_range         ? JSON.stringify(budget_range)         : null,
        dietary_restrictions ? JSON.stringify(dietary_restrictions) : null,
        interests            ? JSON.stringify(interests)            : null,
        preferred_currency   ?? null,
        preferred_language   ?? null,
        email_preferences    ? JSON.stringify(email_preferences)    : null,
        userId,
      ]
    )

    if (!result.rows[0]) return err('Preferences not found', 404)

    // Transformar y validar respuesta de la DB con Zod
    const preferences = PreferencesResponseSchema.parse(result.rows[0])
    return ok(preferences)

  } catch (error) {
    console.error('[PUT /users/me/preferences]', error)
    return err('Internal server error', 500)
  }
}
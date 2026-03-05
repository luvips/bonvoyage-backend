import { z } from 'zod'
import db from '@/lib/db'
import { UserResponseSchema } from '@/lib/schemas/user.schema'


const ProviderSchema = z.enum(['LOCAL', 'GOOGLE', 'APPLE'])

const CreateUserSchema = z.object({
  email:      z.string().email(),
  firstName:  z.string().min(1),
  lastName:   z.string(),
  provider:   ProviderSchema,
  providerId: z.string().optional(),
})


export type Provider       = z.infer<typeof ProviderSchema>
export type CreateUserData = z.infer<typeof CreateUserSchema>

export async function resolveUserId(clerkId: string): Promise<string | null> {
  const result = await db.query<{ user_id: string }>(
    `SELECT u.user_id
     FROM users u
     JOIN user_identities ui ON ui.user_id = u.user_id
     WHERE ui.provider_id = $1
       AND u.deleted_at   IS NULL
     LIMIT 1`,
    [clerkId]
  )
  return result.rows[0]?.user_id ?? null
}

export async function findUserByEmail(email: string) {
  const result = await db.query(
    `SELECT u.user_id, u.email, u.first_name, u.last_name,
            u.role, u.status, u.created_at, u.updated_at,
            a.name      AS avatar_name,
            a.image_url AS avatar_url,
            ui.provider
     FROM users u
     LEFT JOIN avatars         a  ON a.avatar_id = u.avatar_id
     LEFT JOIN user_identities ui ON ui.user_id  = u.user_id
     WHERE u.email      = $1
       AND u.deleted_at IS NULL
     LIMIT 1`,
    [email]
  )

  if (!result.rows[0]) return null
  return UserResponseSchema.parse(result.rows[0])
}

export async function findUserById(userId: string) {
  const result = await db.query(
    `SELECT u.user_id, u.email, u.first_name, u.last_name,
            u.role, u.status, u.created_at, u.updated_at,
            a.name      AS avatar_name,
            a.image_url AS avatar_url,
            ui.provider
     FROM users u
     LEFT JOIN avatars         a  ON a.avatar_id = u.avatar_id
     LEFT JOIN user_identities ui ON ui.user_id  = u.user_id
     WHERE u.user_id    = $1
       AND u.deleted_at IS NULL
     LIMIT 1`,
    [userId]
  )

  if (!result.rows[0]) return null
  return UserResponseSchema.parse(result.rows[0])
}


export async function createUserFromClerk(data: CreateUserData): Promise<string> {
  const parsed = CreateUserSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error(`Invalid user data: ${parsed.error.message}`)
  }

  const { email, firstName, lastName, provider, providerId } = parsed.data
  const client = await db.connect()

  try {
    await client.query('BEGIN')
    const userResult = await client.query<{ user_id: string }>(
      `INSERT INTO users (email, first_name, last_name)
       VALUES ($1, $2, $3)
       RETURNING user_id`,
      [email, firstName, lastName]
    )
    const userId = userResult.rows[0].user_id

    if (provider === 'LOCAL') {
      await client.query(
        `INSERT INTO user_identities (user_id, provider, provider_id, password_hash)
         VALUES ($1, 'LOCAL', NULL, 'MANAGED_BY_CLERK')`,
        [userId]
      )
    } else {
      await client.query(
        `INSERT INTO user_identities (user_id, provider, provider_id)
         VALUES ($1, $2, $3)`,
        [userId, provider, providerId]
      )
    }

    await client.query(
      `INSERT INTO user_preferences (user_id) VALUES ($1)`,
      [userId]
    )

    await client.query(
      `INSERT INTO email_notifications
         (user_id, notification_type, template_data,
          status, scheduled_for, related_entity_type, related_entity_id)
       VALUES ($1, 'WELCOME', $2::jsonb, 'PENDING', NOW(), 'USER', $1)`,
      [userId, JSON.stringify({ first_name: firstName, email })]
    )

    await client.query('COMMIT')
    return userId

  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
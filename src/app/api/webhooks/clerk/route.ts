import { headers } from 'next/headers'
import { Webhook } from 'svix'
import { WebhookEvent } from '@clerk/nextjs/server'
import { z } from 'zod'
import { createUserFromClerk, findUserByEmail } from '@/lib/services/clerk.service'
import { ok, err } from '@/lib/response'
import type { Provider } from '@/lib/services/clerk.service'

const ClerkUserCreatedSchema = z.object({
  id: z.string(),
  email_addresses: z.array(z.object({
    email_address: z.string().email(),
  })).min(1),
  first_name: z.string().nullable(),
  last_name:  z.string().nullable(),
  external_accounts: z.array(z.object({
    provider: z.string(),
  })).optional().default([]),
})

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET
  if (!WEBHOOK_SECRET) {
    console.error('[Webhook] CLERK_WEBHOOK_SECRET is not set')
    return err('Server misconfiguration', 500)
  }

  const headerPayload  = await headers()
  const svix_id        = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return err('Missing svix headers', 400)
  }

  const payload = await req.json()
  const body    = JSON.stringify(payload)
  const wh      = new Webhook(WEBHOOK_SECRET)
  let event: WebhookEvent

  try {
    event = wh.verify(body, {
      'svix-id':        svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch {
    return err('Invalid webhook signature', 401)
  }

  if (event.type !== 'user.created') {
    return ok({ received: true, processed: false })
  }

  const parsed = ClerkUserCreatedSchema.safeParse(event.data)
  if (!parsed.success) {
    console.error('[Webhook] Invalid Clerk payload:', parsed.error.flatten())
    return err('Invalid Clerk event payload', 400)
  }

  const { id: clerkId, email_addresses, first_name, last_name, external_accounts } = parsed.data
  const email     = email_addresses[0].email_address
  const firstName = first_name ?? 'Usuario'
  const lastName  = last_name  ?? ''

  try {
    const existing = await findUserByEmail(email)
    if (existing) {
      console.log(`[Webhook] User ${email} already exists, skipping`)
      return ok({ skipped: true })
    }

    let provider:   Provider          = 'LOCAL'
    let providerId: string | undefined = undefined

    const googleAccount = external_accounts.find((acc) => acc.provider === 'google')
    const appleAccount  = external_accounts.find((acc) => acc.provider === 'apple')

    if (googleAccount) {
      provider   = 'GOOGLE'
      providerId = clerkId
    } else if (appleAccount) {
      provider   = 'APPLE'
      providerId = clerkId
    }

    const userId = await createUserFromClerk({
      email,
      firstName,
      lastName,
      provider,
      providerId,
    })

    console.log(`[Webhook] ✓ User created: ${userId} via ${provider}`)
    return ok({ userId, provider }, 201)

  } catch (error) {
    console.error('[Webhook] Error creating user:', error)
    return err('Failed to create user', 500)
  }
}
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { authenticate } from '../../server/services/auth'
import { withAudit } from '../../server/utils/audit-context'
import { hashPassword } from '../../server/services/password'
import { usePrisma } from '../../server/utils/prisma'

const describeDb = process.env.DATABASE_URL && process.env.NUXT_SESSION_PASSWORD ? describe : describe.skip

describeDb('audit log extension', () => {
  const email = `audit-${randomUUID()}@example.com`
  let userId: string | undefined

  afterAll(async () => {
    const prisma = usePrisma()
    if (userId) {
      await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: userId }, { actorId: userId }] } })
      await prisma.user.delete({ where: { id: userId } })
    }
    await prisma.$disconnect()
  })

  it('records role changes on the same transaction as the write', async () => {
    const prisma = usePrisma()
    const created = await prisma.user.create({
      data: {
        email,
        name: 'Audit Test',
        role: 'TECHNICIAN',
        passwordHash: await hashPassword('ServoraDemo!'),
      },
    })
    userId = created.id

    const createLog = await prisma.auditLog.findFirst({
      where: { entityId: created.id, action: 'user.create' },
    })
    expect(createLog?.after).toMatchObject({ role: 'TECHNICIAN', passwordHash: '[redacted]' })
    expect(JSON.stringify(createLog?.after)).not.toContain('scrypt$')

    expect(await authenticate(email, 'ServoraDemo!')).toMatchObject({ id: created.id, role: 'TECHNICIAN' })
    expect(await authenticate(email, 'wrong-password')).toBeNull()
    expect(await authenticate('missing@example.com', 'ServoraDemo!')).toBeNull()
    expect(await prisma.auditLog.count({
      where: { entityId: created.id, action: 'user.update' },
    })).toBe(0)

    await expect(prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: created.id }, data: { role: 'OWNER' } })
      throw new Error('rollback')
    })).rejects.toThrow('rollback')

    expect((await prisma.user.findUnique({ where: { id: created.id } }))?.role).toBe('TECHNICIAN')
    expect(await prisma.auditLog.count({
      where: { entityId: created.id, action: 'user.update' },
    })).toBe(0)

    await withAudit({ actorId: created.id, action: 'user.role_change', reason: 'Coverage' }, async () => {
      await prisma.user.update({ where: { id: created.id }, data: { role: 'DISPATCHER' } })
    })

    const roleLog = await prisma.auditLog.findFirst({
      where: { entityId: created.id, action: 'user.role_change' },
    })
    expect(roleLog).toMatchObject({
      actorId: created.id,
      reason: 'Coverage',
      entityType: 'User',
      before: expect.objectContaining({ role: 'TECHNICIAN' }),
      after: expect.objectContaining({ role: 'DISPATCHER' }),
    })
  }, 30_000)
})

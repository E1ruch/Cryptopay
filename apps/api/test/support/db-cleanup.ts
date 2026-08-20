import type { PrismaService } from '../../src/database/prisma.service.js';

export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

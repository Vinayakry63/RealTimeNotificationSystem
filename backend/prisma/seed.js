// ============================================================
// DATABASE SEEDER
// Creates demo admin and user accounts for testing
// Run with: node prisma/seed.js
// ============================================================

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const hashedPassword = await bcrypt.hash("password123", 12);

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: {
      name: "Admin User",
      email: "admin@demo.com",
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  // Create regular user
  const user = await prisma.user.upsert({
    where: { email: "user@demo.com" },
    update: {},
    create: {
      name: "Demo User",
      email: "user@demo.com",
      password: hashedPassword,
      role: "USER",
    },
  });

  // Create sample notifications
  await prisma.notification.createMany({
    data: [
      {
        userId: user.id,
        type: "PAYMENT_SUCCESS",
        message: "Your payment of $49.99 was processed successfully.",
        isRead: false,
      },
      {
        userId: user.id,
        type: "ORDER_PLACED",
        message: "Order #1234 has been placed. Estimated delivery: 3 days.",
        isRead: true,
      },
      {
        userId: user.id,
        type: "PROMO_OFFER",
        message: "Exclusive offer! Get 20% off your next order with code SAVE20.",
        isRead: false,
      },
    ],
    skipDuplicates: true,
  });

  console.log("Seeded successfully!");
  console.log("Admin:", admin.email, "/ password123");
  console.log("User: ", user.email, "/ password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

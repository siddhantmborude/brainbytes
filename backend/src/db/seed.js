const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({});

async function main() {
  const staff = [
    { name: "Raj", email: "raj@track.com", password: "password123", role: "DELIVERY", hub: "Mumbai" },
    { name: "Amit", email: "amit@track.com", password: "password123", role: "DELIVERY", hub: "Lonavala" },
    { name: "Yash", email: "yash@track.com", password: "password123", role: "DELIVERY", hub: "Khopoli" },
    { name: "Om", email: "om@track.com", password: "password123", role: "DELIVERY", hub: "Pune" },
    { name: "Admin", email: "admin@track.com", password: "password123", role: "ADMIN", hub: null }
  ];

  for (const person of staff) {
    await prisma.user.upsert({
      where: { email: person.email },
      update: {},
      create: person,
    });
  }

  console.log('Dummy staff seeded.');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });

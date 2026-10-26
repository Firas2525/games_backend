import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { User } from '../modules/users/users.model.js';
import { Order } from '../modules/orders/orders.model.js';
import { ensureShortUserCodes } from '../modules/users/users.service.js';

async function run() {
  await connectDB();
  console.log('Connected to MongoDB. Running migration...');
  
  await ensureShortUserCodes();

  const sampleUsers = await User.find({}).limit(5).select('name email userCode _id');
  console.log('\nSample Users with short codes:');
  sampleUsers.forEach(u => {
    console.log(`- ${u.name} (${u.email}): Code #${u.userCode} | UID: ${u._id}`);
  });

  const sampleOrders = await Order.find({}).limit(5).select('orderId productName');
  console.log('\nSample Orders:');
  sampleOrders.forEach(o => {
    console.log(`- Order: #${o.orderId} - ${o.productName}`);
  });

  await mongoose.disconnect();
  console.log('\nMigration complete.');
  process.exit(0);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

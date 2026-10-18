import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const run = async () => {
  const uri = process.env.MONGO_URI;
  await mongoose.connect(uri);
  const c = mongoose.connection.db.collection('products');
  console.log('Total in DB:', await c.countDocuments());
  console.log('Visible in DB:', await c.countDocuments({ isVisible: true }));
  console.log('Sources:', await c.aggregate([{ $group: { _id: '$source', count: { $sum: 1 } } }]).toArray());
  console.log('MainCats All:', await c.aggregate([{ $group: { _id: '$mainCategory', count: { $sum: 1 } } }]).toArray());
  console.log('MainCats Visible:', await c.aggregate([{ $match: { isVisible: true } }, { $group: { _id: '$mainCategory', count: { $sum: 1 } } }]).toArray());
  await mongoose.disconnect();
};

run().catch(console.error);

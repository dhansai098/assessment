import { MongoClient } from "mongodb";
const url = process.env.MONGO_URL ?? "mongodb://localhost:27017/ims";
export const mongo = new MongoClient(url);
await mongo.connect();

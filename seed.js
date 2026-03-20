// seed.js
// Run ONLY when inserting sample data: 


if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const mongoose = require("mongoose");
const Listing = require("./models/Hlisting");
const data = require("./initData");

const MONGO_URL =
  process.env.MONGO_URL || "mongodb://127.0.0.1:27017/hevenheights_booking";

mongoose
  .connect(MONGO_URL)
  .then(async () => {
    console.log("Connected to MongoDB for seeding");

    // IMPORTANT FIX:
    // Do NOT delete listings. Only seed when database is empty.
    const count = await Listing.countDocuments();

    if (count === 0) {
      console.log("No listings found. Inserting default sample listings...");
      await Listing.insertMany(data);
      console.log("Seed data inserted successfully.");
    } else {
      console.log(`Found ${count} listings. Skipping seeding.`);
    }
  })
  .catch((err) => {
    console.log("Error during DB seeding:", err);
  })
  .finally(() => {
    mongoose.connection.close();
  });

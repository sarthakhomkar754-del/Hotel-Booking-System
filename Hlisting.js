const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const imageSchema = new Schema({
  url: String,
  filename: String
});

const listingSchema = new Schema({
  title: {
    type: String,
    required: true
  },
  description: String,
  image: imageSchema,
  price: {
    type: Number,
    required: true,
    min: 0
  },
  location: String,
  country: String
});

module.exports = mongoose.model("Listing", listingSchema);

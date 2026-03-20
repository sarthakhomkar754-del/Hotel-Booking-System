if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const session = require("express-session");
const bcrypt = require("bcrypt");

const Listing = require("./models/Hlisting");
const User = require("./models/User");
const Booking = require("./models/Booking");
const ExpressError = require("./utils/ExpressError");
const wrapAsync = require("./utils/wrapAsync");

const app = express();

// ================= DATABASE =================
const MONGO_URL =
  process.env.MONGO_URL || "mongodb://127.0.0.1:27017/hevenheights_booking";

mongoose
  .connect(MONGO_URL)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.log("❌ MongoDB Error:", err));

// ================= VIEW ENGINE =================
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ================= MIDDLEWARE =================
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "thisshouldbeabettersecret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    },
  })
);

// ===== GLOBAL VARIABLES (🔥 FIXED HERE) =====
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.isAdmin =
    req.session.user && req.session.user.role === "admin";
  res.locals.activePage = ""; // 🔥 prevents navbar crash
  res.locals.errorMessage = null;
  next();
});

// ================= AUTH MIDDLEWARE =================
const requireLogin = (req, res, next) => {
  if (!req.session.user) return res.redirect("/login");
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== "admin") {
    return next(new ExpressError("Access denied: Admins only", 403));
  }
  next();
};

// ================= ROUTES =================

// Home
app.get("/", (req, res) => {
  res.redirect("/listings");
});

// ================= AUTH =================
app.get("/register", (req, res) => {
  res.render("auth/register", { activePage: "auth" });
});

app.post(
  "/register",
  wrapAsync(async (req, res) => {
    const { username, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).render("auth/register", {
        activePage: "auth",
        errorMessage: "Email already registered.",
      });
    }

    const hashed = await bcrypt.hash(password, 12);
    const adminEmail = process.env.ADMIN_EMAIL || "admin@hevenheights.com";
    const role = email === adminEmail ? "admin" : "user";

    const user = new User({ username, email, password: hashed, role });
    await user.save();

    req.session.user = {
      id: user._id,
      username: user.username,
      role: user.role,
    };

    res.redirect("/listings");
  })
);

app.get("/login", (req, res) => {
  res.render("auth/login", { activePage: "auth", errorMessage: null });
});

app.post(
  "/login",
  wrapAsync(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).render("auth/login", {
        activePage: "auth",
        errorMessage: "Invalid email or password.",
      });
    }

    req.session.user = {
      id: user._id,
      username: user.username,
      role: user.role,
    };

    res.redirect("/listings");
  })
);

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ================= LISTINGS =================
app.get(
  "/listings",
  wrapAsync(async (req, res) => {
    const { q } = req.query;
    let filter = {};

    if (q) {
      const regex = new RegExp(q, "i");
      filter = {
        $or: [
          { title: regex },
          { location: regex },
          { country: regex },
          { description: regex },
        ],
      };
    }

    const listings = await Listing.find(filter);
    res.render("listings/index", {
      listings,
      activePage: "listings",
      q,
    });
  })
);

app.get("/listings/new", requireAdmin, (req, res) => {
  res.render("listings/new", { activePage: "listings" });
});

app.post(
  "/listings",
  requireAdmin,
  wrapAsync(async (req, res) => {
    await new Listing(req.body.listing).save();
    res.redirect("/listings");
  })
);

app.get(
  "/listings/:id",
  wrapAsync(async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    if (!listing) throw new ExpressError("Listing not found", 404);
    res.render("listings/show", { listing, activePage: "listings" });
  })
);

app.get(
  "/listings/:id/edit",
  requireAdmin,
  wrapAsync(async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    if (!listing) throw new ExpressError("Listing not found", 404);
    res.render("listings/edit", { listing, activePage: "listings" });
  })
);

app.put(
  "/listings/:id",
  requireAdmin,
  wrapAsync(async (req, res) => {
    await Listing.findByIdAndUpdate(req.params.id, req.body.listing);
    res.redirect(`/listings/${req.params.id}`);
  })
);

app.delete(
  "/listings/:id",
  requireAdmin,
  wrapAsync(async (req, res) => {
    await Listing.findByIdAndDelete(req.params.id);
    res.redirect("/listings");
  })
);

// ================= BOOKINGS =================
app.post(
  "/listings/:id/book",
  requireLogin,
  wrapAsync(async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    if (!listing) throw new ExpressError("Listing not found", 404);

    const checkIn = new Date(req.body.checkIn);
    const checkOut = new Date(req.body.checkOut);
    const nights = Math.max(
      1,
      Math.round((checkOut - checkIn) / (1000 * 60 * 60 * 24))
    );

    const booking = new Booking({
      user: req.session.user.id,
      hotel: listing._id,
      checkIn,
      checkOut,
      guests: req.body.guests,
      totalPrice: listing.price * nights,
    });

    await booking.save();
    res.redirect("/my-bookings");
  })
);

app.get(
  "/my-bookings",
  requireLogin,
  wrapAsync(async (req, res) => {
    const bookings = await Booking.find({ user: req.session.user.id })
      .populate("hotel")
      .sort({ createdAt: -1 });

    res.render("bookings/myBookings", {
      bookings,
      activePage: "myBookings",
    });
  })
);

//  ADMIN BOOKINGS (FIXED VIEW PATH)
app.get(
  "/admin/bookings",
  requireAdmin,
  wrapAsync(async (req, res) => {
    const bookings = await Booking.find({})
      .populate("user")
      .populate("hotel")
      .sort({ createdAt: -1 });

    res.render("bookings/myBookings", {
      bookings,
      activePage: "adminBookings",
    });

  })
);

// ================= ERRORS =================
app.use((req, res) => {
  throw new ExpressError("Page Not Found", 404);
});

app.use((err, req, res, next) => {
  const { statusCode = 500 } = err;
  res.status(statusCode).render("error", { err });
});

// ================= SERVER =================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);

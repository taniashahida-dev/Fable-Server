require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT || 8000;
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

const uri = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);



// async function run() {
//   try {
//     await client.connect();

client.connect(() => {
    console.log('connecting to MOngo db');
}).catch(console.dir)

    const db = client.db("Fable-db");

    // Declaring collections ONLY ONCE to avoid server crash
    const eBookCollection = db.collection("ebooks");
    const usersCollection = db.collection("user");
    const bookmarkCollection = db.collection("bookmarks");
    const purchasedBookCollection = db.collection("purchased_books");

    const writerTransectionCollection = db.collection("all_transactions");



const verifyToken = async (req, res, next) => {
  const { authorization } = req.headers;

  if (!authorization) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  const token = authorization.split(" ")[1];

  console.log("TOKEN:", token);

  if (!token) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }
  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;

    next();
  } catch (error) {
    console.log(error);
    return res.status(401).json({ msg: "Unauthorized" });
  }
};

const readerVerify = async (req, res, next) => {
  console.log(req.user);
  const user = req.user;
  if (user.role !== "reader") {
    return res.status(403).json({ msg: "Forbidden" });
  }
  next();
};
const writerVerify = async (req, res, next) => {
  const user = req.user;
  if (user.role !== "writer") {
    return res.status(403).json({ msg: "Forbidden" });
  }
  next();
};
const adminVerify = async (req, res, next) => {
  const user = req.user;
  if (user.role !== "admin") {
    return res.status(403).json({ msg: "Forbidden" });
  }
  next();
};


    app.get(
      "/api/admin/raw-analytics",
      verifyToken,
      adminVerify,
      async (req, res) => {
        try {
          const totalUsers = await usersCollection.countDocuments({
            role: "reader",
          });
          const totalWriters = await usersCollection.countDocuments({
            role: "writer",
          });
          const allEbooks = await eBookCollection.find().toArray();

     
          const salesData = await purchasedBookCollection
            .find({ status: "completed" })
            .toArray();
          const feeData = await writerTransectionCollection
            .find({ status: "completed" })
            .toArray();

          res.send({ totalUsers, totalWriters, allEbooks, salesData, feeData });
        } catch (error) {
          res.status(500).send({ error: true, message: error.message });
        }
      },
    );

    // 📋 Get Combined Transactions (Purchased Books + Publishing Fees) for Admin
    app.get(
      "/api/admin/transactions",
      verifyToken,
      adminVerify,
      async (req, res) => {
        try {
          const purchases = await purchasedBookCollection
            .find({ status: "completed" })
            .toArray();

          const publishingFees = await writerTransectionCollection
            .find({ status: "completed" })
            .toArray();

          const formattedPurchases = purchases.map((item) => ({
            _id: item._id,
            transactionId: item.stripeSessionId
              ? item.stripeSessionId.substring(8, 16).toUpperCase()
              : item._id.toString().substring(0, 8).toUpperCase(),
            type: "purchase",
            email: item.buyerEmail,
            ebookTitle: item.bookName,
            amount: item.price,
            date: item.purchasedAt || item.createdAt,
          }));

          const formattedFees = publishingFees.map((item) => ({
            _id: item._id,
            transactionId: item.stripeSessionId
              ? item.stripeSessionId.substring(8, 16).toUpperCase()
              : item._id.toString().substring(0, 8).toUpperCase(),
            type: "publishing_fee",
            email: item.email,
            ebookTitle: "Writer Verification Fee",
            amount: item.amount,
            date: item.date || item.createdAt,
          }));

          const allTransactions = [
            ...formattedPurchases,
            ...formattedFees,
          ].sort((a, b) => new Date(b.date) - new Date(a.date));

          res.send(allTransactions);
        } catch (error) {
          res.status(500).send({ error: true, message: error.message });
        }
      },
    );

    app.get("/api/writer/check-verification/:writerId", async (req, res) => {
      try {
        const { writerId } = req.params;
        const transaction = await writerTransectionCollection.findOne({
          writerId: writerId,
          type: "publishing_fee",
          status: "completed",
        });

        if (transaction) {
          return res.json({ isVerified: true });
        } else {
          return res.json({ isVerified: false });
        }
      } catch (error) {
        console.error("Error checking verification:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // 1. Get all users list
    app.get("/api/users", verifyToken, adminVerify, async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    // 2. Update User Role (PATCH)
    app.patch("/api/users/:id", verifyToken, adminVerify, async (req, res) => {
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { role: req.body.role } },
      );
      res.send(result);
    });

    app.delete("/api/users/:id", verifyToken, adminVerify, async (req, res) => {
      const result = await usersCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });
      res.send(result);
    });

    app.get(
      "/api/purchased-books/reader",
      verifyToken,
      readerVerify,
      async (req, res) => {
        try {
          const userEmail = req.query.email;
          if (!userEmail) {
            return res
              .status(400)
              .send({
                error: true,
                message: "Email query parameter is required",
              });
          }
          const result = await purchasedBookCollection
            .find({ buyerEmail: userEmail, status: "completed" })
            .sort({ purchasedAt: -1 })
            .toArray();

          res.send(result);
        } catch (error) {
          res.status(500).send({ error: true, message: error.message });
        }
      },
    );

    app.get("/api/purchased-books/writer", async (req, res) => {
      try {
        const writerId = req.query.writerId;
        if (!writerId) {
          return res
            .status(400)
            .send({
              error: true,
              message: "Writer ID query parameter is required",
            });
        }

        const result = await purchasedBookCollection
          .find({ writerId: writerId, status: "completed" })
          .sort({ purchasedAt: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    app.delete("/api/bookmarks/:id", verifyToken,
    readerVerify, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await bookmarkCollection.deleteOne(query);
        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    app.get("/api/bookmarks", verifyToken, async (req, res) => {
      try {
        const userEmail = req.query.email;
        const role = req.query.role;

        if (!userEmail) {
          return res
            .status(400)
            .send({
              error: true,
              message: "Email query parameter is required",
            });
        }
        let query = {};

        if (role === "writer") {
          const userName = req.query.name;
          query = { writerName: userName };
        } else {
          query = { userEmail: userEmail };
        }
        const result = await bookmarkCollection.find(query).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    app.post("/api/bookmarks", verifyToken,
    async (req, res) => {
      try {
        const { bookId, userEmail, price } = req.body;

        if (!userEmail)
          return res
            .status(400)
            .send({ error: true, message: "User session not found" });
        const isExist = await bookmarkCollection.findOne({ bookId, userEmail });
        if (isExist)
          return res.send({
            success: false,
            message: "Already bookmarked this book",
          });
        const bookmarkData = {
          ...req.body,
          price: parseFloat(price),
          createdAt: new Date(),
        };

        const result = await bookmarkCollection.insertOne(bookmarkData);
        res.send({
          success: true,
          message: "Bookmarked successfully!",
          result,
        });
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // API Route to fetch all registered writers or a single writer profile safely
    app.get("/api/writers", async (req, res) => {
      try {
        const query = { role: "writer" };

        if (req.query.writerId) {
          const writerId = req.query.writerId;

          if (!ObjectId.isValid(writerId)) {
            return res
              .status(400)
              .send({ error: true, message: "Invalid Writer ID format" });
          }

          query._id = new ObjectId(writerId);
        }

        const cursor = usersCollection.find(query);
        const result = await cursor.toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // API Route to publish / insert a new ebook listing
    app.post("/api/ebooks", verifyToken, writerVerify, async (req, res) => {
      try {
        const ebook = req.body;
        const newEbook = {
          ...ebook,
          createdAt: new Date(),
        };
        const result = await eBookCollection.insertOne(newEbook);
        console.log(result);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    app.get("/api/ebooks", async (req, res) => {
      try {
        const search = req.query.search || "";
        const category = req.query.category || "";
        const availability = req.query.availability || "all";
        const sortBy = req.query.sortBy || "newest";

        // 1. Initialize your query object exactly like your existing structure
        const query = {};

        // Existing condition 1: Filter by writerId if provided
        if (req.query.writerId) {
          query.writerId = req.query.writerId;
        }

        // Existing condition 2: Filter by status if provided
        if (req.query.status) {
          query.status = req.query.status;
        }

        if (search) {
          query.$or = [
            { title: { $regex: search, $options: "i" } },
            { writerName: { $regex: search, $options: "i" } },
          ];
        }

        // NEW CONDITION: CATEGORY FILTER (Matches book genre/category)
        if (category && category !== "all") {
          query.category = { $regex: new RegExp(`^${category}$`, "i") };
        }
        if (availability === "in-stock") {
          query.$or = [{ salesCount: { $exists: false } }, { salesCount: 0 }];
        } else if (availability === "sold") {
          query.salesCount = { $gt: 0 };
        }

        // 2. Setup Sorting configurations
        let sortOptions = {};
        if (sortBy === "price-low") {
          sortOptions.price = 1;
        } else if (sortBy === "price-high") {
          sortOptions.price = -1;
        } else {
          sortOptions.createdAt = -1; // Default: Newest first
        }

        // 3. Fetch from MongoDB Collection using your updated query and sort rules
        const cursor = eBookCollection.find(query).sort(sortOptions);
        const result = await cursor.toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // API Route to fetch metadata of a specific standalone ebook document
    app.get("/api/ebooks/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .send({ error: true, message: "Invalid ID format" });
        }
        const query = { _id: new ObjectId(id) };
        const result = await eBookCollection.findOne(query);

        if (!result) {
          return res
            .status(404)
            .send({ error: true, message: "Ebook not found" });
        }

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    app.patch(
      "/api/ebooks/:id",
      verifyToken,
      writerVerify,
      async (req, res) => {
        try {
          const id = req.params.id;
          const updateData = req.body;

          const filter = { _id: new ObjectId(id) };

          const updateDoc = {
            $set: {
              ...updateData,
              updatedAt: new Date(),
            },
          };

          if (updateData.title) {
            updateDoc.$set.status = "Pending";
          }

          const result = await eBookCollection.updateOne(filter, updateDoc);
          res.send(result);
        } catch (error) {
          res.status(500).send({ error: true, message: error.message });
        }
      },
    );

    // API Route to remove / delete an ebook permanently from the database index
    app.delete("/api/ebooks/:id", verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const result = await eBookCollection.deleteOne(query);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
//     console.log(
//       "Pinged your deployment. You successfully connected to MongoDB!",
//     );
//   } finally {
//     // Keep client connection pool active
//     // await client.close()
//   }
// }

// run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});

module.exports = app;
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

client.connect()
  .then(() => {
    console.log(" MongoDB Connected");
  })
  .catch((err) => {
    console.error("MongoDB Error:", err);
  });


    const db = client.db("Fable-db");

    // Declaring collections ONLY ONCE to avoid server crash
    const eBookCollection = db.collection("ebooks");
    const usersCollection = db.collection("user");
    const bookmarkCollection = db.collection("bookmarks");
    const purchasedBookCollection = db.collection("purchased_books");

    const writerTransectionCollection = db.collection("all_transactions");



const getUserId = (user) => {
  const id = user?.sub || user?.id;
  return id ? String(id) : "";
};

const toIdVariants = (id) => {
  const strId = String(id || "").trim();
  if (!strId) return [];
  return ObjectId.isValid(strId) ? [strId, new ObjectId(strId)] : [strId];
};

const verifyToken = async (req, res, next) => {
  const { authorization } = req.headers;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      error: true,
      message: "Unauthorized",
    });
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      error: true,
      message: "Unauthorized",
    });
  }
  try {
    const { payload } = await jwtVerify(token, JWKS);

    if (!payload || (!payload.sub && !payload.id)) {
      return res.status(401).json({ error: true, message: "Unauthorized" });
    }

    if (
      payload.sub &&
      payload.id &&
      String(payload.sub) !== String(payload.id)
    ) {
      return res.status(401).json({ error: true, message: "Unauthorized" });
    }

    req.user = payload;

    next();
  } catch (error) {
    console.error("JWT verification failed:", error.message);
    return res.status(401).json({ error: true, message: "Unauthorized" });
  }
};

const requireRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: true, message: "Forbidden" });
  }
  next();
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

    app.get(
      "/api/writer/check-verification/:writerId",
      verifyToken,
      requireRoles("writer", "admin"),
      async (req, res) => {
        try {
          const { writerId } = req.params;
          const currentUserId = getUserId(req.user);

          if (req.user.role === "writer" && String(writerId) !== currentUserId) {
            return res.status(403).json({
              error: true,
              message:
                "Forbidden: cannot check another writer's verification status",
            });
          }

          const writerIdVariants = toIdVariants(writerId);
          if (writerIdVariants.length === 0) {
            return res
              .status(400)
              .json({ error: true, message: "Invalid writer ID" });
          }

          const transaction = await writerTransectionCollection.findOne({
            writerId: { $in: writerIdVariants },
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
      },
    );

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
      requireRoles("reader", "admin"),
      async (req, res) => {
        try {
          const requestedEmail = req.query.email
            ? String(req.query.email).trim()
            : "";
          const tokenEmail = String(req.user.email || "")
            .trim()
            .toLowerCase();

          if (req.user.role === "reader") {
            if (!tokenEmail) {
              return res
                .status(401)
                .send({ error: true, message: "Unauthorized" });
            }
            if (
              requestedEmail &&
              requestedEmail.toLowerCase() !== tokenEmail
            ) {
              return res.status(403).send({
                error: true,
                message:
                  "Forbidden: cannot access another reader's purchase history",
              });
            }
          } else if (!requestedEmail) {
            return res.status(400).send({
              error: true,
              message: "Email query parameter is required",
            });
          }

          const targetEmail =
            req.user.role === "admin"
              ? requestedEmail
              : String(req.user.email).trim();
          const emailVariants = Array.from(
            new Set([targetEmail, targetEmail.toLowerCase()]),
          );

          const result = await purchasedBookCollection
            .find({ buyerEmail: { $in: emailVariants }, status: "completed" })
            .sort({ purchasedAt: -1 })
            .toArray();

          res.send(result);
        } catch (error) {
          res.status(500).send({ error: true, message: error.message });
        }
      },
    );

    app.get(
      "/api/purchased-books/writer",
      verifyToken,
      requireRoles("writer", "admin"),
      async (req, res) => {
        try {
          const requestedWriterId = req.query.writerId
            ? String(req.query.writerId).trim()
            : "";
          const currentUserId = getUserId(req.user);

          if (req.user.role === "writer") {
            if (requestedWriterId && requestedWriterId !== currentUserId) {
              return res.status(403).send({
                error: true,
                message:
                  "Forbidden: cannot access another writer's sales history",
              });
            }
          } else if (!requestedWriterId) {
            return res.status(400).send({
              error: true,
              message: "Writer ID query parameter is required",
            });
          }

          const targetWriterId =
            req.user.role === "admin" ? requestedWriterId : currentUserId;
          const writerIdVariants = toIdVariants(targetWriterId);

          const result = await purchasedBookCollection
            .find({
              writerId: { $in: writerIdVariants },
              status: "completed",
            })
            .sort({ purchasedAt: -1 })
            .toArray();

          res.send(result);
        } catch (error) {
          res.status(500).send({ error: true, message: error.message });
        }
      },
    );

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
        const userEmail = req.query.email ? String(req.query.email).trim() : "";
        const role = req.query.role;
        const tokenEmail = String(req.user.email || "")
          .trim()
          .toLowerCase();
        const currentUserId = getUserId(req.user);

        if (role === "writer") {
          if (req.user.role !== "writer" && req.user.role !== "admin") {
            return res.status(403).send({
              error: true,
              message:
                "Forbidden: writer analytics restricted to writers and admins",
            });
          }

          if (
            userEmail &&
            req.user.role !== "admin" &&
            userEmail.toLowerCase() !== tokenEmail
          ) {
            return res.status(403).send({
              error: true,
              message: "Forbidden: email does not match authenticated user",
            });
          }

          const requestedWriterId = req.query.writerId
            ? String(req.query.writerId).trim()
            : "";

          if (req.user.role === "writer") {
            if (requestedWriterId && requestedWriterId !== currentUserId) {
              return res.status(403).send({
                error: true,
                message:
                  "Forbidden: cannot access another writer's bookmark analytics",
              });
            }
          } else if (!requestedWriterId) {
            return res.status(400).send({
              error: true,
              message: "Writer ID query parameter is required",
            });
          }

          const targetWriterId =
            req.user.role === "admin" ? requestedWriterId : currentUserId;
          const writerIdVariants = toIdVariants(targetWriterId);

          const writerBooks = await eBookCollection
            .find(
              { writerId: { $in: writerIdVariants } },
              { projection: { _id: 1 } },
            )
            .toArray();
          const writerBookIdVariants = writerBooks.flatMap((b) => [
            b._id.toString(),
            b._id,
          ]);

          const legacyNoWriterIdFilter = {
            $or: [
              { writerId: { $exists: false } },
              { writerId: null },
              { writerId: "" },
            ],
          };

          const writerQuery =
            writerBookIdVariants.length > 0
              ? {
                  $or: [
                    { writerId: { $in: writerIdVariants } },
                    {
                      $and: [
                        { bookId: { $in: writerBookIdVariants } },
                        legacyNoWriterIdFilter,
                      ],
                    },
                  ],
                }
              : { writerId: { $in: writerIdVariants } };

          const result = await bookmarkCollection.find(writerQuery).toArray();
          return res.send(result);
        }

        if (!userEmail) {
          return res.status(400).send({
            error: true,
            message: "Email query parameter is required",
          });
        }

        if (
          req.user.role !== "admin" &&
          userEmail.toLowerCase() !== tokenEmail
        ) {
          return res.status(403).send({
            error: true,
            message: "Forbidden: cannot access another user's bookmarks",
          });
        }

        const targetEmail =
          req.user.role === "admin"
            ? userEmail
            : String(req.user.email || userEmail).trim();
        const emailVariants = Array.from(
          new Set([targetEmail, targetEmail.toLowerCase()]),
        );

        const result = await bookmarkCollection
          .find({ userEmail: { $in: emailVariants } })
          .toArray();
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
    // app.get("/api/ebooks/:id", async (req, res) => {
    //   try {
    //     const id = req.params.id;

    //     if (!ObjectId.isValid(id)) {
    //       return res
    //         .status(400)
    //         .send({ error: true, message: "Invalid ID format" });
    //     }
    //     const query = { _id: new ObjectId(id) };
    //     const result = await eBookCollection.findOne(query);

    //     if (!result) {
    //       return res
    //         .status(404)
    //         .send({ error: true, message: "Ebook not found" });
    //     }

    //     res.send(result);
    //   } catch (error) {
    //     res.status(500).send({ error: true, message: error.message });
    //   }
    // });

app.get("/api/ebooks/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const email = req.query.email;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        error: true,
        message: "Invalid ID",
      });
    }

    const ebook = await eBookCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!ebook) {
      return res.status(404).send({
        error: true,
        message: "Ebook not found",
      });
    }

    let hasPurchased = false;

    if (email) {
      hasPurchased = await purchasedBookCollection.countDocuments({
        buyerEmail: email.trim().toLowerCase(),
        bookId: id,
        status: "completed",
      }) > 0;
    }

    res.send({
      ...ebook,
      hasPurchased,
    });
  } catch (error) {
    res.status(500).send({
      error: true,
      message: error.message,
    });
  }
});

    const normalizeEbookStatus = (value) => {
      if (typeof value !== "string") return null;
      const lower = value.trim().toLowerCase();
      if (lower === "pending") return "Pending";
      if (lower === "published") return "published";
      if (lower === "unpublished") return "unpublished";
      return null;
    };

    app.patch(
      "/api/ebooks/:id",
      verifyToken,
      requireRoles("writer", "admin"),
      async (req, res) => {
        try {
          const id = req.params.id;
          if (!ObjectId.isValid(id)) {
            return res.status(400).send({
              error: true,
              message: "Invalid ebook ID format",
            });
          }

          const filter = { _id: new ObjectId(id) };
          const existingBook = await eBookCollection.findOne(filter);
          if (!existingBook) {
            return res.status(404).send({
              error: true,
              message: "Ebook not found",
            });
          }

          const updateData = req.body || {};
          const setFields = {};

          if (req.user.role === "admin") {
            if (updateData.status !== undefined) {
              const normalizedStatus = normalizeEbookStatus(updateData.status);
              if (!normalizedStatus) {
                return res.status(400).send({
                  error: true,
                  message: "Invalid status value",
                });
              }
              setFields.status = normalizedStatus;
            }

            if (updateData.availabilityStatus !== undefined) {
              const normalizedAvailability = String(
                updateData.availabilityStatus,
              )
                .trim()
                .toLowerCase();
              if (!["available", "sold"].includes(normalizedAvailability)) {
                return res.status(400).send({
                  error: true,
                  message: "Invalid availabilityStatus value",
                });
              }
              setFields.availabilityStatus = normalizedAvailability;
            }

            if (Object.keys(setFields).length === 0) {
              return res.status(400).send({
                error: true,
                message: "No valid moderation fields provided",
              });
            }
          } else {
            const currentUserId = getUserId(req.user);
            if (String(existingBook.writerId || "") !== currentUserId) {
              return res.status(403).send({
                error: true,
                message: "Forbidden: you can only modify your own ebooks",
              });
            }

            const protectedFields = [
              "_id",
              "writerId",
              "writerName",
              "salesCount",
              "availabilityStatus",
              "createdAt",
            ];
            const attemptedProtected = protectedFields.filter((field) =>
              Object.prototype.hasOwnProperty.call(updateData, field),
            );
            if (attemptedProtected.length > 0) {
              return res.status(403).send({
                error: true,
                message: `Forbidden: cannot modify protected field(s): ${attemptedProtected.join(", ")}`,
              });
            }

            const allowedContentFields = [
              "title",
              "price",
              "category",
              "tags",
              "description",
              "coverImage",
            ];

            for (const field of allowedContentFields) {
              if (updateData[field] !== undefined) {
                if (field === "price") {
                  const parsedPrice = Number(updateData.price);
                  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
                    return res.status(400).send({
                      error: true,
                      message: "Invalid price value",
                    });
                  }
                  setFields.price = parsedPrice;
                } else {
                  setFields[field] = updateData[field];
                }
              }
            }

            if (updateData.status !== undefined) {
              const requestedStatus = normalizeEbookStatus(updateData.status);
              if (
                !requestedStatus ||
                !["published", "unpublished"].includes(requestedStatus)
              ) {
                return res.status(400).send({
                  error: true,
                  message:
                    "Writers can only set status to published or unpublished",
                });
              }

              const currentStatus = String(
                existingBook.status || "Pending",
              ).toLowerCase();
              if (!["published", "unpublished"].includes(currentStatus)) {
                return res.status(403).send({
                  error: true,
                  message:
                    "Pending ebooks must be approved by an admin before changing publish status",
                });
              }

              setFields.status = requestedStatus;
            }

            if (setFields.title !== undefined) {
              setFields.status = "Pending";
            }

            if (Object.keys(setFields).length === 0) {
              return res.status(400).send({
                error: true,
                message: "No valid editable fields provided",
              });
            }
          }

          setFields.updatedAt = new Date();

          const result = await eBookCollection.updateOne(filter, {
            $set: setFields,
          });
          res.send(result);
        } catch (error) {
          res.status(500).send({ error: true, message: error.message });
        }
      },
    );

    // API Route to remove / delete an ebook permanently from the database index
    app.delete(
      "/api/ebooks/:id",
      verifyToken,
      requireRoles("writer", "admin"),
      async (req, res) => {
        try {
          const id = req.params.id;
          if (!ObjectId.isValid(id)) {
            return res.status(400).send({
              error: true,
              message: "Invalid ebook ID format",
            });
          }

          const query = { _id: new ObjectId(id) };
          const existingBook = await eBookCollection.findOne(query);

          if (!existingBook) {
            return res.status(404).send({
              error: true,
              message: "Ebook not found",
            });
          }

          if (req.user.role === "writer") {
            const currentUserId = getUserId(req.user);
            if (String(existingBook.writerId || "") !== currentUserId) {
              return res.status(403).send({
                error: true,
                message: "Forbidden: you can only delete your own ebooks",
              });
            }
          }

          const result = await eBookCollection.deleteOne(query);
          res.send(result);
        } catch (error) {
          res.status(500).send({ error: true, message: error.message });
        }
      },
    );

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
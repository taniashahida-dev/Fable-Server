require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT || 8000;
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const uri = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    const db = client.db("Fable-db");

    // Declaring collections ONLY ONCE to avoid server crash
    const eBookCollection = db.collection("ebooks");
    const usersCollection = db.collection("user"); 

    // API Route to fetch all registered writers or a single writer profile safely
    app.get('/api/writers', async (req, res) => {
      try {
        const query = { role: 'writer' };
        
        if (req.query.writerId) {
          const writerId = req.query.writerId;
          
          if (!ObjectId.isValid(writerId)) {
            return res.status(400).send({ error: true, message: "Invalid Writer ID format" });
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
    app.post('/api/ebooks', async (req, res) => {
      try {
        const ebook = req.body;
        const newEbook = {
          ...ebook,
          createdAt: new Date()
        };
        const result = await eBookCollection.insertOne(newEbook);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });



    

   app.get('/api/ebooks', async (req, res) => {
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

    // NEW CONDITION: REGEX SEARCH (Matches book title or writer name)
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { writerName: { $regex: search, $options: "i" } }
      ];
    }

    // NEW CONDITION: CATEGORY FILTER (Matches book genre/category)
    if (category && category !== "all") {
      query.category = { $regex: new RegExp(`^${category}$`, "i") };
    }

    // NEW CONDITION: AVAILABILITY FILTER (Based on salesCount logic)
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
    app.get('/api/ebooks/:id', async (req, res) => {
      try {
        const id = req.params.id;
       
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: true, message: "Invalid ID format" });
        }
        const query = { _id: new ObjectId(id) };
        const result = await eBookCollection.findOne(query);
        
        if (!result) {
          return res.status(404).send({ error: true, message: "Ebook not found" });
        }
        
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // API Route to modify / update specific fields of an ebook document dynamically
    app.patch('/api/ebooks/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const updateData = req.body; 
        
        const filter = { _id: new ObjectId(id) };
        
        const updateDoc = {
          $set: {
            ...updateData,      
            updatedAt: new Date() 
          },
        };

        if (updateData.title) {
           updateDoc.$set.status = 'Pending'; 
        }

        const result = await eBookCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: error.message });
      }
    });

    // API Route to remove / delete an ebook permanently from the database index
    app.delete('/api/ebooks/:id', async (req, res) => {
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
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Keep client connection pool active
    // await client.close()
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
require("dotenv").config();
const express = require("express") 
const app = express();
const port = process.env.PORT || 8000;
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
// const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const uri = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello World!')
})




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

  const eBookCollection = db.collection("ebooks");


app.post('/api/ebooks', async(req,res)=>{
  const ebook = req.body
  const newEbook = {
    ...ebook,
   createdAt : new Date()
  } 
  console.log(ebook)
  const result = await eBookCollection.insertOne(newEbook)

  res.send(result)
})

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // await client.close()
  }
};

run().catch(console.dir);






app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
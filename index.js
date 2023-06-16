const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const stripe = require("stripe")(process.env.GIVING_SECRET_KEY)
const app = express();
const port = process.env.PORT || 5000;
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-close');
  next();
});

//middleware
const corsOptions ={
  origin:'*',
  credentials:true,
  optionSuccessStatus:200,
  }
  app.use(cors(corsOptions))
app.use(express.json())

// verify Token
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1]

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorozed' })
    }
    req.decoded = decoded;
    next();
  })
}


//Mongodb Database Connect
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.baw8kky.mongodb.net/?retryWrites=true&w=majority`;

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
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // DATABASE COLLECTION
    const usersSet = client.db('summarDB').collection('users');
    const classSet = client.db('summarDB').collection('class');
    const classCartSet = client.db('summarDB').collection('classcart')
    const paymentCollection = client.db('summarDB').collection('payments')

    //jwt token
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ token })
    })
    // veirfyInstructor
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersSet.findOne(query)
      if (user?.role !== 'instructor') {
        return res.status(403).send({ error: true, message: 'forbidden message' })
      }
      next()
    }

    // verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersSet.findOne(query)
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden message' })
      }
      next()
    }

    // USER INFORMATION-----------------
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersSet.find().toArray()
      res.send(result)
    })
    // USER ROLE
    app.patch('/users/instructorrole/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          role: 'instructor'
        }
      };
      const result = await usersSet.updateOne(filter, updateDoc);
      res.send(result)

    })

    app.patch('/users/adminrole/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          role: 'admin'
        }
      };
      const result = await usersSet.updateOne(filter, updateDoc);
      res.send(result)
    })


    // END USER INFORMATION-----------------

    // CLASS INFORMATION
    app.get('/classes', async (req, res) => {
      const approvedClass = req.query.status
      if (!approvedClass) {
        return res.send([])
      }
      const query = { status: approvedClass }
      const result = await classSet.find(query).toArray()
      res.send(result)
    })
    //--Popular Classes
    app.get('/popularclasses', async (req, res) =>{
      const popularclass = req.query.status
      if(!popularclass){
        return res.send([])
      }
      const query = {status : popularclass}
      const result = await classSet.find(query).sort({enrolledstudent : -1}).toArray()
      res.send(result)
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user?.email }
      const existingUser = await usersSet.findOne(query)
      if (existingUser) {
        return res.send({ message: 'User already Exist' })
      }
      const result = await usersSet.insertOne(user)
      res.send(result)
    })
    
    app.post('/classcart', verifyJWT, async (req, res) => {
      const classCart = req.body;
      const classname = classCart.classname;
      const useremail = classCart.useremail;
      const query = {classname, useremail}
      const existclass = await classCartSet.findOne(query);
       if (existclass) {
        return res.send({ message: 'class is already exist' });
      }
      const result = await classCartSet.insertOne(classCart);
      res.send(result);
    });

    app.get('/classcart', verifyJWT, async(req, res) =>{
      const useremail = req.query.email;
      // console.log(email)
      const query = {useremail : useremail}
      const result = await classCartSet.find(query).toArray()
      res.send(result)
    })

    // Enrolled Student
    app.get('/enrolled', verifyJWT, async(req, res) =>{
      const email = req.query.email;
      const query = {email : email}
      const result = await paymentCollection.find(query).toArray()
      res.send(result)
    } ) 

    app.delete('/classcart/:id', verifyJWT , async(req, res) =>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await classCartSet.deleteOne(query)
      res.send(result)
    })
    // INSTRUCTOR-------------------
    

    app.get('/users/totalinstructor', async (req, res) => {
      const role = req.query.role;
      const query = { role: role };
      const result = await usersSet.find(query).toArray();
      res.send(result);
    });

    // verifyInstructor
    app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersSet.findOne(query)
      const result = { instructor: user?.role === 'instructor' }
      res.send(result)
    })

    // Instructor Add Class
    app.post('/users/instructor/addclass', verifyJWT, verifyInstructor, async (req, res) => {
      const summarClass = req.body;
      const result = await classSet.insertOne(summarClass)
      res.send(result)
    })

    // Instructor Class
    app.get('/users/instractor/class', verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.send([])
      }
      const query = { email: email }
      const result = await classSet.find(query).toArray()
      res.send(result)
    })



    // ADMIN--------------------------
    //verifyAdmin
    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersSet.findOne(query)
      const result = { admin: user?.role === 'admin' }
      res.send(result)
    })

    // adminclass
    app.get('/users/admin', verifyJWT, async (req, res) => {
      const result = await classSet.find().toArray()
      res.send(result)
    })
    // admin approved class
    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          status: 'approved'
        }
      };
      const result = await classSet.updateOne(filter, updateDoc);
      res.send(result)

    })
    // admin denied class
    app.patch('/users/administrator/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          status: 'denied'
        }
      };
      const result = await classSet.updateOne(filter, updateDoc);
      res.send(result)
    })
    
    app.patch('/users/adminfeedback/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const feedback = req.body;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          feedback: feedback
        }
      };
      const result = await classSet.updateOne(filter, updateDoc);
      res.send(result)
    });
    // create payment intent
    app.post('/create-payment-intent', verifyJWT, async (req, res) =>{
      const {price} = req.body;
      const amount = price*100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })

    })
    // payment related api
    app.post('/payments', verifyJWT, async(req, res) =>{
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment)
      const query = { _id: { $in: payment.selectedclasses.map(id => new ObjectId(id)) } }
      const deleteResult = await classCartSet.deleteMany(query);
      const classQuery = { _id: { $in: payment.classId.map(id => new ObjectId(id)) } }
      const modifiedClasses = await classSet.updateMany(classQuery, {
        $inc:{
          enrolledstudent: 1, seats: -1
        }
      }, {upsert: true})
      res.send({ insertResult, deleteResult, modifiedClasses })
    })
    app.get('/payments' , verifyJWT, async(req, res) =>{
      const email = req.query.email;
      if(!email){
        return res.send({message: 'Email not Found'})
      }
      const query = {email: email}
      const result = await paymentCollection.find(query).sort({ date: -1 }).toArray()
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully Connected Summar Camp Database");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

//--------------------

app.get('/', (req, res) => {
  res.send('Summer Camp is open now')
})
app.listen(port, () => {
  console.log(`Summer Camp is Running on Port: ${port}`)
})

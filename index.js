const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jwuefig.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorization access' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (error, decoded) {
        if (error) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}


function sendPaymentConfirmationEmail(order) {
    const { patient, patientName, treatment, date, slot } = order;

    const { _id, toolPrice, toolName, customerName, customerEmail, customerPhone } = order;
  
    var email = {
      from: process.env.EMAIL_SENDER,
      to: customerEmail,
      subject: `We have received your payment for ${toolName} is Confirmed`,
      text: `Your payment for this Appointment ${toolName} is Confirmed`,
      html: `
        <div>
          <p> Hello ${customerName}, </p>
          <h3>Thank you for your payment . </h3>
          <h3>We have received your payment</h3>
          <h3>Our Address</h3>
          <p>Bangladesh-Feni</p>
          <p>Bangladesh</p>
          <a href="https://web.programming-hero.com/">unsubscribe</a>
        </div>
      `
    };
  
    emailClient.sendMail(email, function (err, info) {
      if (err) {
        console.log(err);
      }
      else {
        console.log('Message sent: ', info);
      }
    });
  
  }


async function run() {
    try {
        await client.connect();
        const toolCollection = client.db('electricTools').collection('tools');
        const orderCollection = client.db('electricTools').collection('orders');
        const usersCollection = client.db('electricTools').collection('users');
        const paymentsCollection = client.db('electricTools').collection('payments');
        const reviewCollection = client.db('electricTools').collection('reviews');
        const profileCollection = client.db('electricTools').collection('profile');

        app.get('/tool', async (req, res) => {
            const query = {};
            const cursor = toolCollection.find(query);
            const tools = await cursor.toArray();
            res.send(tools);
        });

        app.get('/tool', verifyJWT, async(req, res) => {
            const tools = await toolCollection.find().toArray();
            res.send(tools);
        })

        app.post('/tool', verifyJWT, async(req, res) => {
            const newTool = req.body;
            const result = await toolCollection.insertOne(newTool);
            res.send(result);
        })

        app.delete('/tool/:id', verifyJWT, async(req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await toolCollection.deleteOne(filter);
            res.send(result);
        })

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
        })




        app.post('/profile', async (req, res) => {
            const profile = req.body;
            const result = await profileCollection.insertOne(profile);
            res.send(result);
        });


        app.get('/profile/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await profileCollection.findOne(query);
            res.send(result);
        });



        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        })

        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await usersCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await usersCollection.updateOne(filter, updateDoc);
                res.send(result);
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        });

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ result, token });
        });

        app.get('/tool/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const tool = await toolCollection.findOne(query);
            res.send(tool);
        });

        app.get('/order/:id', verifyJWT, async(req, res) => {
            const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const order = await orderCollection.findOne(query);
            res.send(order);
        });

        app.get('/order', verifyJWT, async (req, res) => {
            const email = req.query.customerEmail;
            const decodedEmail = req.decoded.email;
            if (email === decodedEmail) {
                const query = { customerEmail: email };
                const orders = await orderCollection.find(query).toArray();
                return res.send(orders);
            }
            else {
                return res.status(403).send({ message: 'forbidden access' });
            }
        });

        app.patch('/order/:id', verifyJWT, async(req, res) => {
            const id = req.params.id;
        const payment = req.body;
        const filter = {_id: ObjectId(id)};
        const updateDoc = {
            $set: {
                paid: true,
                transactionId: payment.transactionId,
            }
        }
        const result = await paymentsCollection.insertOne(payment);
        const updatedOrder = await orderCollection.updateOne(filter, updateDoc);
        res.send(updatedOrder)
        });

        
        app.post('/order', async (req, res) => {
            const order = req.body;
            const result = await orderCollection.insertOne(order);
            res.send(result);
        });

        app.post('/create-payment-intent', verifyJWT, async(req, res) => {
          const service = req.body;
          const price = service.toolPrice;
          console.log(price)
          const amount = price*100;
          console.log(price);
          const paymentIntent = await stripe.paymentIntents.create({
              amount : amount,
              currency: 'usd',
              payment_method_types:['card']
          })
          res.send({clientSecret: paymentIntent.client_secret})
        })

        app.post('/review', async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send(result);
        });

        app.get('/review', async (req, res) => {
            const query = {};
            const cursor = reviewCollection.find(query);
            const allReview = await cursor.toArray();
            res.send(allReview);
        });

    }
    finally { }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello Electric Tools Manufacturer!')
})

app.listen(port, () => {
    console.log(`Electric Tools App listening on port ${port}`)
})
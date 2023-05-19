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
};

function sendPaymentConfirmationEmail(order) {
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
};


async function run() {
    try {
        const toolCollection = client.db('electricTools').collection('tools');
        const orderCollection = client.db('electricTools').collection('orders');
        const userCollection = client.db('electricTools').collection('users');
        const paymentsCollection = client.db('electricTools').collection('payments');
        const reviewCollection = client.db('electricTools').collection('reviews');
        // const profileCollection = client.db('electricTools').collection('profile');


        // Verify Admin
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await userCollection.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }




        // Tools Operation
        app.get('/tools', async (req, res) => {
            const query = {};
            const tools = await toolCollection.find(query).toArray();
            res.send(tools);
        });

        app.get('/tool/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const tool = await toolCollection.findOne(query);
            res.send(tool);
        });

        app.post('/tool', verifyJWT, verifyAdmin, async (req, res) => {
            const newTool = req.body;
            const result = await toolCollection.insertOne(newTool);
            res.send(result);
        });

        app.delete('/tool/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await toolCollection.deleteOne(filter);
            res.send(result);
        });





        // Order Operation
        app.post('/order', async (req, res) => {
            const order = req.body;
            const result = await orderCollection.insertOne(order);
            res.send(result);
        });

        app.get('/orders', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;

            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const query = { customerEmail: email };
            const orders = await orderCollection.find(query).toArray();
            res.send(orders);
        });

        app.get('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const order = await orderCollection.findOne(query);
            res.send(order);
        });


        app.patch('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
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




        // User operation
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET)
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' });
        });

        app.post('/user', async (req, res) => {
            const user = req.body;
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        app.get('/users', async (req, res) => {
            const query = {};
            const users = await userCollection.find(query).toArray();
            res.send(users);
        });

        app.put('/user/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        app.get('/user/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        });

        app.delete('/user/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result);
        });

        app.get('/user', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;

            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            res.send(user);
        });

        app.put('/user/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const user = req.body;
            const options = { upsert: true };

            const updateDoc = {
                $set: {
                    name: user.name,
                    email: user.email,
                    image: user.image,
                    education: user.education,
                    country: user.country,
                    phone: user.phone,
                },
            };

            const result = await userCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });




        // Payment operation
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const service = req.body;
            const price = service.toolPrice;
            console.log(price)
            const amount = price * 100;
            console.log(price);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({ clientSecret: paymentIntent.client_secret })
        });




        // review operation
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




        // Profile operation
        // app.post('/profile', async (req, res) => {
        //     const profile = req.body;
        //     const result = await profileCollection.insertOne(profile);
        //     res.send(result);
        // });


        // app.get('/profile/:id', async (req, res) => {
        //     const id = req.params.id;
        //     const query = { _id: ObjectId(id) };
        //     const result = await profileCollection.findOne(query);
        //     res.send(result);
        // });
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
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


async function run() {
    try {
        const toolCollection = client.db('electricTools').collection('tools');
        const orderCollection = client.db('electricTools').collection('orders');
        const userCollection = client.db('electricTools').collection('users');
        const paymentCollection = client.db('electricTools').collection('payments');
        const reviewCollection = client.db('electricTools').collection('reviews');


        // Verify Admin
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await userCollection.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        };



        //NOTE: User related api
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
            const userInfo = req.body;
            const query = { email: userInfo.email };

            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exist' });
            }

            const result = await userCollection.insertOne(userInfo);
            res.send(result);
        });

        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
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
            const updateUserInfo = req.body;
            const { name, email, image, education, country, phone } = updateUserInfo;

            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };

            const updateDoc = {
                $set: {
                    name: name,
                    email: email,
                    image: image,
                    education: education,
                    country: country,
                    phone: phone,
                },
            };

            const result = await userCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });



        //NOTE: Tools related api
        app.get('/tools', async (req, res) => {
            const query = {};
            const tools = await toolCollection.find(query).toArray();
            res.send(tools);
        });

        app.get('/totalTools', async (req, res) => {
            const result = await toolCollection.estimatedDocumentCount();
            res.send({ totalTools: result });
        });

        app.get('/all-tools', async (req, res) => {
            const page = parseInt(req.query.page) || 0;
            const limit = parseInt(req.query.limit) || 6;
            const skip = page * limit;

            const search = req.query.search;
            let cursor;
            if (search) {
                cursor = toolCollection.find({ name: { $regex: search, $options: 'i' } });
            }
            else {
                cursor = toolCollection.find();
            }

            const result = await cursor.skip(skip).limit(limit).toArray();
            res.send(result);
        });

        app.get('/tool/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const tool = await toolCollection.findOne(query);
            res.send(tool);
        });

        app.post('/tool', verifyJWT, verifyAdmin, async (req, res) => {
            const newToolData = req.body;
            const query = { name: newToolData.name };

            const existingTool = await toolCollection.findOne(query);
            if (existingTool) {
                return res.send({ message: 'This tool already exists' })
            }
            else {
                const result = await toolCollection.insertOne(newToolData);
                return res.send(result);
            }
        });

        app.delete('/tool/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await toolCollection.deleteOne(filter);
            res.send(result);
        });

        app.put('/tool/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateProductData = req.body;
            const { name, image, minimumQuantity, availableQuantity, price, description, rating } = updateProductData;

            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    name: name,
                    image: image,
                    minimumQuantity: minimumQuantity,
                    availableQuantity: availableQuantity,
                    price: price,
                    description: description,
                    rating: rating
                },
            };

            const result = await toolCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });



        //NOTE: Order related api
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
            const paymentInfo = req.body;
            const id = req.params.id;

            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: paymentInfo.transactionId,
                    date: paymentInfo.date
                }
            }
            const insertResult = await paymentCollection.insertOne(paymentInfo);
            const updatedOrder = await orderCollection.updateOne(filter, updateDoc);
            res.send(updatedOrder)
        });

        app.delete('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await orderCollection.deleteOne(query);
            res.send(result);
        });



        //NOTE: payment related api
        app.post('/create-payment-intent', async (req, res) => {
            const payment = req.body;
            const price = payment.totalToolPrice;
            console.log(price);
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                "payment_method_types": [
                    "card"
                ]
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.get('/payments', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }

            const query = { customerEmail: email };
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        });



        //NOTE: review related api
        app.post('/review', verifyJWT, async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send(result);
        });

        app.get('/reviews', async (req, res) => {
            const query = {};
            const cursor = reviewCollection.find(query);
            const allReview = await cursor.toArray();
            res.send(allReview);
        });

        app.delete('/review/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await reviewCollection.deleteOne(query);
            res.send(result);
        });


        //NOTE: admin stats api
        app.get('/admin-stats', verifyJWT, verifyAdmin, async (req, res) => {
            const payments = await paymentCollection.find().toArray();
            const revenue = payments.reduce((sum, payment) => sum + payment.totalToolPrice, 0);

            const customers = await userCollection.estimatedDocumentCount();
            const tools = await toolCollection.estimatedDocumentCount();
            const orders = await paymentCollection.estimatedDocumentCount();

            res.send({
                revenue,
                customers,
                tools,
                orders
            });
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
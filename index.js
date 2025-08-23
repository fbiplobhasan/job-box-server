const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
require('dotenv').config()

const port = process.env.PORT || 3000;

app.use(cors({
    origin: ['http://localhost:5173',
            'https://job-box-fba7f.web.app',
            'https://job-box-fba7f.firebaseapp.com'
    ],
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

const logger = (req, res, next) => {
    console.log('inside the logger');
    next();
}

const verifyToken = (req, res, next) => {
    const token = req?.cookies?.token;
    if (!token) {
        return res.status(401).send({ message: 'Unauthorized access' })
    }
    // vetify the token
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'Unauthorized access' })
        }
        req.user = decoded;
        next();
    })
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dqhfr.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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

        const jobsCollection = client.db('jobBox').collection('jobs')
        const jobApplicationCollection = client.db('jobBox').collection('job_application');

        // Auth related apis
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === "production",
                })
                .send({ success: true });
        })

        app.post('/logout', (req, res) => {
            res
                .clearCookie('token', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === "production",
                })

                .send({ success: true })
        })

        // job related apis
        app.get('/jobs', async (req, res) => {
            const email = req.query.email;
            let query = {};
            if (email) {
                query = { hr_email: email }
            }
            const cursor = jobsCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/jobs/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await jobsCollection.findOne(query)
            res.send(result);
        })

        app.post('/jobs', async (req, res) => {
            const newJob = req.body;
            const result = await jobsCollection.insertOne(newJob);
            res.send(result);
        })

        // job application apis
        // get all data, get one data, get some data [0,1 or many]
        app.get('/job-application', verifyToken, async (req, res) => {
            const email = req.query.email;
            const query = { applicant_email: email }

            //verify //email req.user.email !=== or ==== req.query.email
            if (req.user.email !== req.query.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }


            const result = await jobApplicationCollection.find(query).toArray();

            // aggregate data
            for (const application of result) {
                console.log(application.job_id);
                const query1 = { _id: new ObjectId(application.job_id) }
                const job = await jobsCollection.findOne(query1);
                if (job) {
                    application.title = job.title;
                    application.location = job.location;
                    application.jobType = job.jobType;
                    application.hr_name = job.hr_name;
                    application.applicationDeadline = job.applicationDeadline;
                    application.company = job.company;
                    application.company_logo = job.company_logo;
                }
            }

            res.send(result);
        })

        app.get('/job-applications/jobs/:job_id', async (req, res) => {
            const jobId = req.params.job_id;
            const query = { job_id: jobId }
            const result = await jobApplicationCollection.find(query).toArray();
            res.send(result);
        })
        app.post('/job-application', async (req, res) => {
            const application = req.body;
            const result = await jobApplicationCollection.insertOne(application);
            // Not the best way (use aggregate)
            const id = application.job_id;
            const query = { _id: new ObjectId(id) }
            const job = await jobsCollection.findOne(query)

            let newCount = 0;

            if (job.applicationCount) {
                newCount = job.applicationCount + 1;
            } else {
                newCount = 1;
            }
            // now update the job info
            const filter = { _id: new ObjectId(id) }
            const updatedJob = {
                $set: {
                    applicationCount: newCount
                }
            }

            const updatedResult = await jobsCollection.updateOne(filter, updatedJob);

            res.send(result)
        })


        app.patch('/job-applications/:id', async (req, res) => {
            const id = req.params.id;
            const data = req.body;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: data.status,
                }
            }
            const result = await jobApplicationCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Job server is running.')
})

app.listen(port, () => {
    console.log(`Job server is running on ${port}`);
})
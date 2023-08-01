const express = require('express')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
require('dotenv').config()
const { json } = require('express/lib/response');
const { query, response } = require('express');
const jwt = require('jsonwebtoken')
const app = express()
const port = process.env.PORT || 8000

app.use(cors())
app.use(express.json())
app.get('/', (req, res) => {
    res.send('Hello From Doctor uncle')
})



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nx8c2qf.mongodb.net/?retryWrites=true&w=majority`;


const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT(req, res, next) { //kew email er maddome jno amr data dekhte na pare
    const authHeaders = req.headers.authorization
    if (!authHeaders) {
        return res.status(404).send({ message: 'unAuthorized access' })
    }
    const token = authHeaders.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db("doctort's_portal").collection('services');
        const bookingsCollection = client.db("doctort's_portal").collection('bookings');
        const usersCollection = client.db("doctort's_portal").collection('users');
        const doctorsCollection = client.db("doctort's_portal").collection('doctor');

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email //requester hocche j onno ekjon user k admin diccee
            const requesterAccount = await usersCollection.findOne({ email: requester })
            if (requesterAccount.role === 'admin') {
                next()
            }
            else {
                res.status(403).send({ message: 'Forbidden' })
            }

        }

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 })
            const services = await cursor.toArray();
            res.send(services);

        });

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email
            const user = await usersCollection.findOne({ email: email })
            const isAdmin = user.role === 'admin'
            res.send({ admin: isAdmin })
        })


        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            //condition er maddome j request dicce she admin kina dekhsi,jodi tar role admin hoi ta hole she onno jon k admin dite parbe,,noito parbena...fornidden maessage dibe

            const filter = { email: email }
            const updateDoc = {
                $set: { role: 'admin' },//database user role addmin hishebe set hobe
            }
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send({ result });




        });

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;

            const filter = { email: email }
            const options = { upsert: true };//user thakle data base e add korbena,na thakle add korbe
            const updateDoc = {
                $set: user
            }
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token });
            console.log(filter);

        });
        app.get('/user', verifyJWT, async (req, res) => {
            const users = await usersCollection.find().toArray();//sob user der find korar jonno
            res.send(users)
        })

        app.get('/available', async (req, res) => {
            const date = req.query.date;
            //step 1:get all service
            const services = await serviceCollection.find().toArray();
            /// step 2:get the booking that day
            const query = { date: date };
            const bookings = await bookingsCollection.find(query).toArray();
            console.log(query);

            services.forEach(service => {
                //ki ki booked hoise oi gula ber korte hobe
                const serviceBookings = bookings.filter(book => book.treatment === service.name)
                const bookedSlots = serviceBookings.map(book => book.slot)// booked kora service er joto gula slots booked ase oi gula map kore ber kora
                const available = service.slots.filter(slot => !bookedSlots.includes(slot))//j gula slot booked e nai oi gula select korlm
                service.slots = available //this is not the proper way for query //aggregation pipeline is proper way

            })
            /*   services.forEach(service => {
                  const serviceBookings = bookings.filter(b => b.treatment === service.name)
                  const booked = serviceBookings.map(s => s.slot)
                  //service.booked = booked
                  //service.booked = serviceBookings.map(s => s.slot)//booked service find korlam map kore
                  const available = service.slots.filter(s => !booked.includes(s))
                  service.slot = available
  
              }) */
            res.send(services)



        });
        /* Api naming convention
        app.get('/booking')get all booking in this collection or get more then one by filter
        app.get('/booking/:id') get a specific booking
        app.post('/booking') add a new booking
        app.patch('/booking/:id') for update booking
        app.delete('/booking/:id') for delete booking
        
        */
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exist = await bookingsCollection.findOne(query)
            if (exist) {
                return res.send({ success: false, booking: exist })
            }
            const result = await bookingsCollection.insertOne(booking);
            res.send({ success: true, result });


        });
        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body
            const result = await doctorsCollection.insertOne(doctor)
            /* const query={name:doctor.name,email:doctor.email,specialty:doctor.specialty,img:doctor.img} */
            res.send(result)
        })
        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email
            const query = { email: email }
            const result = await doctorsCollection.deleteOne(query)
            /* const query={name:doctor.name,email:doctor.email,specialty:doctor.specialty,img:doctor.img} */
            res.send(result)



        })
        app.get('/payment/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const booking = await bookingsCollection.findOne(query)
            res.send(booking)
        })




        app.get('/booking', verifyJWT, async (req, res) => {

            const patient = req.query.patient;
            //const authorization=req.headers.authorization
            //console.log(authorization)
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingsCollection.find(query).toArray();
                res.send(bookings);

            }
            else return res.status(403).send({ message: 'Forbidden access' });





        })
        app.get('/doctor', async (req, res) => {
            const doctor = await doctorsCollection.find().toArray()
            res.send(doctor);

        })









    } finally {
        // Ensures that the client will close when you finish/error



    }
}
run().catch(console.dir);


app.listen(port, () => {
    console.log(`Doctors app listening on port ${port}`)
})
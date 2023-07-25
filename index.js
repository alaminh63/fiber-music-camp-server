require("dotenv").config();
const express = require("express");
const port = process.env.PORT || 3000;
const app = express();
const jwt = require("jsonwebtoken");
const cors = require("cors");
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

app.use(cors());
app.use(express.json());
// verify jwt token
const verifyToken = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }

  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.SECKRET_KEY, (error, decoded) => {
    if (error) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};
console.log(process.env.USER_NAME);
console.log(process.env.SECRET_PASSWORD);
// mongodb server connect 
const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.SECRET_PASSWORD}@cluster0.pdzlhd7.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    //  client.connect();
    const classesCollection = client.db("fiberMusicCamp").collection("classes");
    const instructorCollection = client
      .db("fiberMusicCamp")
      .collection("instructor");
    const usersCollection = client.db("fiberMusicCamp").collection("users");
    const seletedCollection = client
      .db("fiberMusicCamp")
      .collection("seleted_classes");
    const paymentsCollection = client
      .db("fiberMusicCamp")
      .collection("payments");
    const enrolledCollection = client
      .db("fiberMusicCamp")
      .collection("enrolled_classes");

    // verify admin
    const verityAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await usersCollection.findOne({ email: email });
      if (user?.role !== "admin") {
        return res
          .status(401)
          .send({ error: true, message: "unauthorized access" });
      }
      next();
    };

    const verityInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await usersCollection.findOne({ email: email });
      if (user?.role !== "instructor") {
        return res
          .status(401)
          .send({ error: true, message: "unauthorized access" });
      }
      next();
    };
// jwt section
    app.post("/jwt", (req, res) => {
      const email = req.query.email;
      const token = jwt.sign(
        {
          email: email,
        },
        process.env.SECKRET_KEY,
        { expiresIn: "20000h" }
      );
      res.send({ token });
    });

    // checking authorization
    app.get("/authorization", async (req, res) => {
      const email = req?.query?.email;
      const user = await usersCollection.findOne({ email: email });
      if (user) {
        res.send({ role: user?.role });
      }
    });

    // users requests section here

    app.put("/add-user", async (req, res) => {
      const userData = req.body;
      const email = req?.query?.email;
      const filter = {
        email: email,
      };

      const savedUser = await usersCollection.findOne(filter);
      const user = {
        $set: {
          name: userData?.name,
          email: userData?.email,
          photo_url: userData?.photo_url,
          role: savedUser?.role || "student",
        },
      };
      const options = { upsert: true };
      const result = await usersCollection.updateOne(filter, user, options);
      res.send(result);
    });

     // instructors requests section
    app.get("/instructors", async (req, res) => {
      const instructors = await instructorCollection.find().toArray();
      res.send(instructors);
    });

    app.get("/popular-instructors", async (req, res) => {
      const instructors = await instructorCollection.find().limit(6).toArray();
      res.send(instructors);
    });
    // classes requests section here
    app.get("/classes", async (req, res) => {
      const classStatus = req.query.status;
      const filter = classStatus === "all" ? {} : { status: classStatus };
      const classes = await classesCollection.find(filter).toArray();
      res.send(classes);
    });
    app.get("/class/:id", async (req, res) => {
      const id = req.params.id;
      const singleClass = await classesCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(singleClass);
    });
    app.post("/add-class", verifyToken, verityInstructor, async (req, res) => {
      const data = req.body;
      const newClass = {
        class_name: data.class_name,
        class_image: data.class_image,
        instructor_name: data.instructor_name,
        instructor_email: data.instructor_email,
        avilable_seats: parseFloat(data.avilable_seats),
        price: parseFloat(data.price),
        status: "pending",
        student_enroll: 0,
        feedback: "",
      };

      const instructor = await instructorCollection.findOne({
        email: data.instructor_email,
      });

      if (!instructor) {
        await instructorCollection.insertOne({
          name: data.instructor_name,
          image: data.instructor_photo,
          email: data.instructor_email,
        });
      }

      const result = await classesCollection.insertOne(newClass);
      res.send(result);
    });

    app.put(
      "/update-class/:id",
      verifyToken,
      verityInstructor,
      async (req, res) => {
        const id = req.params.id;
        const data = req.body;
        const updatedClass = {
          $set: {
            class_name: data.class_name,
            avilable_seats: parseFloat(data.avilable_seats),
            price: parseFloat(data.price),
          },
        };
        const result = await classesCollection.updateOne(
          { _id: new ObjectId(id) },
          updatedClass
        );
        res.send(result);
      }
    );

    // popular classes section started here
    app.get("/popular-classes", async (req, res) => {
      const result = await classesCollection
        .find({ status: "Approved" }, { sort: { student_enroll: -1 } })
        .limit(6)
        .toArray();
      res.send(result);
    });
    // change status
    app.put(
      "/change-class-status/:id",
      verifyToken,
      verityAdmin,
      async (req, res) => {
        const status = req.body.status;
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedStatus = {
          $set: {
            status: status,
          },
        };
        const result = await classesCollection.updateOne(filter, updatedStatus);
        res.send(result);
      }
    );

    // update user role section started here

    app.put(
      "/change-user-role/:id",
      verifyToken,
      verityAdmin,
      async (req, res) => {
        const role = req.body.role;
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedRole = {
          $set: {
            role: role,
          },
        };
        const result = await usersCollection.updateOne(filter, updatedRole);
        console.log(result);
        res.send(result);
      }
    );

    app.get("/my-classes", verifyToken, verityInstructor, async (req, res) => {
      const email = req?.query?.email;
      const result = await classesCollection
        .find({ instructor_email: email })
        .toArray();
      res.send(result);
    });

    // admin page req section here
    app.get("/users", verifyToken, verityAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.delete("/delete-user/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.post("/select-class", verifyToken, async (req, res) => {
      const singleClass = req.body;

      const addToClass = {
        class_id: singleClass.class_id,
        class_name: singleClass.class_name,
        class_image: singleClass.class_image,
        instructor_name: singleClass.instructor_name,
        instructor_email: singleClass.instructor_email,
        price: singleClass.price,
        email: singleClass.email,
      };

      const result = await seletedCollection.insertOne(addToClass);
      res.send(result);
    });

    // feedback section here
    app.put(
      "/send-feedback/:id",
      verifyToken,
      verityAdmin,
      async (req, res) => {
        const feedback = req.body.feedback;
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedFeedBack = {
          $set: {
            feedback: feedback,
          },
        };
        const result = await classesCollection.updateOne(
          filter,
          updatedFeedBack
        );
        res.send(result);
      }
    );

    app.get("/selected-classes", verifyToken, async (req, res) => {
      const email = req?.query?.email;
      const result = await seletedCollection.find({ email: email }).toArray();
      res.send(result);
    });

    app.get("/enrolled-classes", verifyToken, async (req, res) => {
      const email = req?.query?.email;
      const result = await enrolledCollection.find({ email: email }).toArray();
      res.send(result);
    });

    app.delete("/delete-selected-class/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await seletedCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // payments system code here
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", verifyToken, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentsCollection.insertOne(payment);
      const query = {
        _id: { $in: payment.selectedClasses.map((id) => new ObjectId(id)) },
      };
      const deleteResult = await seletedCollection.deleteMany(query);
      const classesQuery = {
        _id: { $in: payment.classes.map((classId) => new ObjectId(classId)) },
      };
      const option = {
        projection: {
          _id: 0,
          class_image: 1,
          class_name: 1,
          instructor_name: 1,
          instructor_email: 1,
          price: 1,
        },
      };
      const paidClasses = await classesCollection
        .find(classesQuery, option)
        .toArray();
      const enrolled = paidClasses.map((paidClass) => {
        return {
          ...paidClass,
          email: payment.email,
        };
      });
      await enrolledCollection.insertMany(enrolled);

      const updateValue = {
        $inc: {
          avilable_seats: -1,
          student_enroll: 1,
        },
      };
      await classesCollection.updateMany(classesQuery, updateValue);

      res.send({ insertResult, deleteResult });
    });

    app.get("/payment-history", verifyToken, async (req, res) => {
      const email = req?.query?.email;
      const result = await paymentsCollection
        .find({ email: email }, { sort: { date: -1 } })
        .toArray();
      res.send(result);
    });
  } catch (error) {
    console.log(error);
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is running");
});

app.listen(port);

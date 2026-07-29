require('dotenv').config();

const express = require('express');
const cors = require('cors');

const authRouter = require('./routes/auth');
const studentRouter = require('./routes/student');
const parentRouter = require('./routes/parent');
const policyRouter = require('./routes/policy');
const plansRouter = require('./routes/plans');
const reviewsRouter = require('./routes/reviews');
const assessmentsRouter = require('./routes/assessments');

const app = express();
app.use(cors({ origin: true, allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/student', studentRouter);
app.use('/api/parent', parentRouter);
app.use('/api/policy', policyRouter);
app.use('/api/plans', plansRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/assessments', assessmentsRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`twinplane-backend listening on http://localhost:${port}`);
});

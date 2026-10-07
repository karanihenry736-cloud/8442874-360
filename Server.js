require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// ===== FIREBASE SETUP =====
if (!admin.apps.length) {
  // Weka hizi kwa Render Env Variables
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

// ===== CONFIG =====
const CONFIG = {
  SHORTCODE: "8442874",
  REGISTRATION_AMOUNT: 360,
  CONSUMER_KEY: process.env.CONSUMER_KEY,
  CONSUMER_SECRET: process.env.CONSUMER_SECRET,
  PORT: process.env.PORT || 5000
};

// ===== TOKEN =====
async function getDarajaToken() {
  const auth = Buffer.from(`${CONFIG.CONSUMER_KEY}:${CONFIG.CONSUMER_SECRET}`).toString('base64');
  const { data } = await axios.get(
    'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${auth}` } }
  );
  return data.access_token;
}

// ===== ROUTES =====
app.get('/', (req,res) => res.json({
  message: "Till 8442874 - Registration 360 - Firebase Live",
  shortcode: CONFIG.SHORTCODE
}));

app.get('/register', async (req, res) => {
  try {
    const token = await getDarajaToken();
    const host = req.get('host');
    const payload = {
      ShortCode: CONFIG.SHORTCODE,
      ResponseType: "Completed",
      ConfirmationURL: `https://${host}/confirmation`,
      ValidationURL: `https://${host}/validation`
    };
    const { data } = await axios.post('https://api.safaricom.co.ke/mpesa/c2b/v1/registerurl', payload,
      { headers: { Authorization: `Bearer ${token}` } });
    res.json({ success: true, daraja_response: data });
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

app.post('/validation', (req, res) => {
  const amount = parseFloat(req.body.TransAmount);
  if (amount < CONFIG.REGISTRATION_AMOUNT) {
    return res.json({ ResultCode: "C2B0001", ResultDesc: `Registration is ${CONFIG.REGISTRATION_AMOUNT}` });
  }
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

app.post('/confirmation', async (req, res) => {
  try {
    const payment = {
      transID: req.body.TransID,
      amount: req.body.TransAmount,
      phone: req.body.MSISDN,
      names: `${req.body.FirstName} ${req.body.MiddleName} ${req.body.LastName}`,
      billRef: req.body.BillRefNumber,
      transTime: req.body.TransTime,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Save to Firebase
    await db.collection('till_8442874_payments').doc(req.body.TransID).set(payment);
    console.log("SAVED TO FIREBASE:", payment);

    res.json({ ResultCode: 0, ResultDesc: "Received" });
  } catch (e) {
    console.error(e);
    res.json({ ResultCode: 0, ResultDesc: "Received but DB error" });
  }
});

app.get('/payments', async (req,res) => {
  const snapshot = await db.collection('till_8442874_payments').orderBy('createdAt','desc').limit(100).get();
  const payments = snapshot.docs.map(doc => doc.data());
  const total = payments.reduce((s,p) => s + parseFloat(p.amount), 0);
  res.json({ total_payments: payments.length, total_amount: total, payments });
});

app.listen(CONFIG.PORT, () => console.log(`Running ${CONFIG.PORT}`));

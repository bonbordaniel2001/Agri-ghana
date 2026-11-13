require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve fixed frontend folder
app.use(express.static(path.join(__dirname, 'public')));

// In-Memory User Store (Enforces 1 Phone Number = 1 Strict Role)
const users = [];

// Register New Account (Strict Single-Role Binding)
app.post('/api/auth/register', (req, res) => {
  const { name, role, phone, pin, region, ghanaCard } = req.body;

  const existingUser = users.find(u => u.phone === phone);
  if (existingUser) {
    return res.status(409).json({
      status: 'error',
      message: `Phone ${phone} is already bound to a ${existingUser.role.toUpperCase()} account. Please sign in.`
    });
  }

  const isVerified = ghanaCard && ghanaCard.trim().length >= 6;
  const newUser = {
    name,
    role,
    phone,
    pin,
    region,
    ghanaCard: ghanaCard || '',
    isVerified,
    trustScore: isVerified ? 150 : 100
  };

  users.push(newUser);
  res.status(201).json({ status: 'success', user: newUser });
});

// Sign In (Strict PIN & Role Verification)
app.post('/api/auth/login', (req, res) => {
  const { phone, pin } = req.body;
  const user = users.find(u => u.phone === phone);

  if (!user) {
    return res.status(404).json({ status: 'error', message: 'Account not found. Please create an account first.' });
  }
  if (user.pin !== pin) {
    return res.status(401).json({ status: 'error', message: 'Incorrect 4-digit PIN.' });
  }

  res.json({ status: 'success', user });
});

// Live USSD Webhook Endpoint (*920*77#)
app.post('/api/ussd', (req, res) => {
  const { text = '' } = req.body;
  const inputs = text.split('*');
  let response = '';

  if (text === '') {
    response = 'CON AgriLink Ghana\n1. Post New Crop\n2. Active Escrow Orders\n3. My Trust Score';
  } else if (text === '1') {
    response = 'CON Select Crop:\n1. Maize\n2. Cassava\n3. Yam';
  } else if (inputs[0] === '1' && inputs.length === 2) {
    response = 'CON Enter quantity (in bags):';
  } else if (inputs[0] === '1' && inputs.length === 3) {
    response = `END Success! ${inputs[2]} bags listed on AgriLink Marketplace.`;
  } else if (text === '2') {
    response = 'END No pending escrow disputes. Check web dashboard for delivery OTPs.';
  } else if (text === '3') {
    response = 'END Trust Score: 150 PTS (Verified Tier). Commission rate: 2%.';
  } else {
    response = 'END Invalid option. Dial *920*77# again.';
  }

  res.set('Content-Type', 'text/plain');
  res.send(response);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AgriLink Ghana running on http://localhost:${PORT}`));
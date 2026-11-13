require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db/connection');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

/* ==========================================
   1. AUTHENTICATION APIS
   ================================---------- */

// Register Account (Strict Single-Role Binding)
app.post('/api/auth/register', async (req, res) => {
  const { name, role, phone, pin, region, ghanaCard } = req.body;

  try {
    const existing = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        status: 'error',
        message: `Phone ${phone} is already bound to a ${existing.rows[0].role.toUpperCase()} account.`
      });
    }

    const isVerified = ghanaCard && ghanaCard.trim().length >= 6;
    const trustScore = isVerified ? 150 : 100;

    const query = `
      INSERT INTO users (name, role, phone, pin, region, ghana_card, is_verified, trust_score)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const values = [name, role, phone, pin, region, ghanaCard || '', isVerified, trustScore];
    const newUser = (await db.query(query, values)).rows[0];

    res.status(201).json({ status: 'success', user: newUser });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ status: 'error', message: 'Database registration error.' });
  }
});

// Sign In (PIN & Role Verification)
app.post('/api/auth/login', async (req, res) => {
  const { phone, pin } = req.body;

  try {
    const result = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Account not found. Please register first.' });
    }

    const user = result.rows[0];
    if (user.pin !== pin) {
      return res.status(401).json({ status: 'error', message: 'Incorrect 4-digit PIN.' });
    }

    res.json({ status: 'success', user });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ status: 'error', message: 'Database login error.' });
  }
});

/* ==========================================
   2. MARKETPLACE & PRODUCTS APIS
   ================================---------- */

// Get All Crop Listings
app.get('/api/products', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM products ORDER BY trust_score DESC, created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch Products Error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Post New Crop Listing
app.post('/api/products', async (req, res) => {
  const { farmerPhone, farmerName, cropName, region, hub, quantityBags, pricePerBag, trustScore, isVerified } = req.body;

  try {
    const query = `
      INSERT INTO products (farmer_phone, farmer_name, crop_name, region, hub, quantity_bags, price_per_bag, trust_score, is_verified)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;
    const values = [farmerPhone, farmerName, cropName, region, hub, quantityBags, pricePerBag, trustScore || 100, isVerified || false];
    const newProduct = (await db.query(query, values)).rows[0];

    res.status(201).json({ status: 'success', product: newProduct });
  } catch (err) {
    console.error('Create Product Error:', err);
    res.status(500).json({ error: 'Failed to create product listing' });
  }
});

/* ==========================================
   3. ESCROW & LOGISTICS APIS
   ================================---------- */

// Checkout & Create Escrow Order (Generates 4-Digit OTP)
app.post('/api/orders/checkout', async (req, res) => {
  const { productId, buyerPhone, cropName, route, amount } = req.body;
  const deliveryOtp = Math.floor(1000 + Math.random() * 9000); // Generate 4-digit OTP
  const orderId = 'AGR-' + Math.floor(100000 + Math.random() * 900000);

  try {
    const query = `
      INSERT INTO orders_escrow (order_id, product_id, buyer_phone, crop_name, route, amount, delivery_otp, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'In Transit')
      RETURNING *;
    `;
    const values = [orderId, productId, buyerPhone, cropName, route, amount, deliveryOtp];
    const order = (await db.query(query, values)).rows[0];

    res.status(201).json({ status: 'success', order });
  } catch (err) {
    console.error('Checkout Error:', err);
    res.status(500).json({ error: 'Failed to initialize escrow order' });
  }
});

// Driver Verify Delivery OTP (Releases Escrow Funds)
app.post('/api/orders/verify-delivery', async (req, res) => {
  const { orderId, enteredOtp } = req.body;

  try {
    const result = await db.query('SELECT * FROM orders_escrow WHERE order_id = $1', [orderId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Order not found.' });
    }

    const order = result.rows[0];
    if (parseInt(order.delivery_otp, 10) !== parseInt(enteredOtp, 10)) {
      return res.status(400).json({ status: 'error', message: 'Invalid 4-digit delivery OTP.' });
    }

    // Update order status to Delivered / Released
    await db.query("UPDATE orders_escrow SET status = 'Delivered & Released' WHERE order_id = $1", [orderId]);

    res.json({ status: 'success', message: 'Escrow funds successfully released to farmer!' });
  } catch (err) {
    console.error('OTP Verification Error:', err);
    res.status(500).json({ error: 'Failed to verify delivery OTP' });
  }
});

/* ==========================================
   4. USSD GATEWAY WEBHOOK (*920*77#)
   ================================---------- */

app.post('/api/ussd', async (req, res) => {
  const { phoneNumber, text = '' } = req.body;
  const inputs = text.split('*');
  let response = '';

  if (text === '') {
    response = 'CON AgriLink Ghana\n1. Post New Crop\n2. Active Escrow Orders\n3. My Trust Score';
  } else if (text === '1') {
    response = 'CON Select Crop:\n1. White Maize\n2. Pona Yam\n3. Fresh Cassava';
  } else if (inputs[0] === '1' && inputs.length === 2) {
    response = 'CON Enter quantity (in bags):';
  } else if (inputs[0] === '1' && inputs.length === 3) {
    response = 'CON Enter price per bag (GHS):';
  } else if (inputs[0] === '1' && inputs.length === 4) {
    const qty = inputs[2];
    const price = inputs[3];
    
    try {
      await db.query(
        `INSERT INTO products (farmer_phone, farmer_name, crop_name, region, hub, quantity_bags, price_per_bag, trust_score, is_verified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [phoneNumber || '+233240000000', 'USSD Farmer', 'Maize (USSD)', 'Central', 'Mankessim Hub', qty, price, 150, true]
      );
    } 
      catch (err) {
  console.error('Database Error Message:', err.message);
  res.status(500).json({ status: 'error', message: err.message });
}
    

    response = `END Success! ${qty} bags listed at GHS ${price}/bag on AgriLink Marketplace.`;
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
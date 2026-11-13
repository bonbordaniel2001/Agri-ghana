const ROLE_MEDIA = {
  buyer: {
    video: "https://assets.mixkit.co/videos/preview/mixkit-fresh-vegetables-at-a-farmers-market-42874-large.mp4",
    overlay: "linear-gradient(135deg, rgba(10, 42, 24, 0.84), rgba(17, 24, 39, 0.78))"
  },
  farmer: {
    video: "https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-green-fields-and-a-river-42718-large.mp4",
    overlay: "linear-gradient(135deg, rgba(20, 83, 45, 0.82), rgba(30, 41, 59, 0.78))"
  },
  driver: {
    video: "https://assets.mixkit.co/videos/preview/mixkit-highway-in-the-middle-of-a-forest-at-sunset-41539-large.mp4",
    overlay: "linear-gradient(135deg, rgba(15, 23, 42, 0.85), rgba(30, 58, 138, 0.75))"
  },
  admin: {
    video: "https://assets.mixkit.co/videos/preview/mixkit-digital-animation-of-futuristic-devices-99786-large.mp4",
    overlay: "linear-gradient(135deg, rgba(17, 24, 39, 0.88), rgba(6, 78, 59, 0.80))"
  }
};

let currentUser = null;
let authMode = 'register';

let crops = [
  { id: 101, name: "White Maize (Grade A)", farmer: "Kwame Mensah", region: "Central", hub: "Mankessim Hub", qty: 20, price: 620, trust: 155, verified: true },
  { id: 102, name: "Pona Yam Tubers", farmer: "Abena Osei", region: "Bono", hub: "Techiman Market", qty: 35, price: 850, trust: 170, verified: true },
  { id: 103, name: "Fresh Cassava", farmer: "Ibrahim Fuseini", region: "Northern", hub: "Tamale Central", qty: 15, price: 380, trust: 110, verified: false }
];

let activeOrders = [];
let selectedCropForCheckout = null;
let ussdSessionText = "";

function setAuthMode(mode) {
  authMode = mode;
  document.getElementById('tabRegister').classList.toggle('active', mode === 'register');
  document.getElementById('tabLogin').classList.toggle('active', mode === 'login');

  const regFields = document.getElementById('registerFields');
  const nameInput = document.getElementById('authFullName');
  const submitBtn = document.getElementById('authSubmitBtn');

  if (mode === 'register') {
    regFields.classList.remove('d-none');
    nameInput.required = true;
    submitBtn.innerHTML = 'Create Account & Enter Portal <i class="bi bi-arrow-right ms-1"></i>';
  } else {
    regFields.classList.add('d-none');
    nameInput.required = false;
    submitBtn.innerHTML = 'Sign In to My Assigned Portal <i class="bi bi-box-arrow-in-right ms-1"></i>';
  }
}

function previewRoleTheme(role) {
  const videoEl = document.getElementById('roleBgVideo');
  const sourceEl = document.getElementById('roleVideoSource');
  const overlayEl = document.getElementById('videoOverlay');

  if (ROLE_MEDIA[role] && sourceEl.src !== ROLE_MEDIA[role].video) {
    videoEl.style.opacity = 0;
    setTimeout(() => {
      sourceEl.src = ROLE_MEDIA[role].video;
      overlayEl.style.background = ROLE_MEDIA[role].overlay;
      videoEl.load();
      videoEl.play().catch(() => {});
      videoEl.style.opacity = 1;
    }, 220);
  }
}

// Strict Single-User, Single-Role Authentication
async function handleAuthSubmit(e) {
  e.preventDefault();

  const phone = `+233${document.getElementById('authPhone').value.trim().replace(/\s+/g, '')}`;
  const pin = document.getElementById('authPin').value.trim();
  const savedAccounts = JSON.parse(localStorage.getItem('agrilink_accounts') || '{}');

  if (authMode === 'register') {
    const selectedRole = document.querySelector('input[name="userRole"]:checked').value;
    const fullName = document.getElementById('authFullName').value.trim();
    const region = document.getElementById('authRegion').value;
    const ghanaCard = document.getElementById('authGhanaCard').value.trim();

    if (savedAccounts[phone]) {
      showToast(`Phone ${phone} already has a ${savedAccounts[phone].role.toUpperCase()} account. Use Sign In.`);
      setAuthMode('login');
      return;
    }

    const payload = { name: fullName, role: selectedRole, phone, pin, region, ghanaCard };

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.message);
        return;
      }
      currentUser = data.user;
    } catch {
      const isVerified = ghanaCard.length >= 6;
      currentUser = { ...payload, isVerified, trustScore: isVerified ? 150 : 100 };
    }

    savedAccounts[phone] = currentUser;
    localStorage.setItem('agrilink_accounts', JSON.stringify(savedAccounts));
    localStorage.setItem('agrilink_active_session', JSON.stringify(currentUser));
    enterLockedPortal(currentUser);

  } else {
    // Sign In Mode: strictly loads the single role bound to this user
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin })
      });
      const data = await res.json();
      if (res.ok) {
        currentUser = data.user;
      } else if (savedAccounts[phone] && savedAccounts[phone].pin === pin) {
        currentUser = savedAccounts[phone];
      } else {
        showToast(data.message || 'Invalid phone number or PIN.');
        return;
      }
    } catch {
      if (!savedAccounts[phone] || savedAccounts[phone].pin !== pin) {
        showToast('Invalid phone number or PIN.');
        return;
      }
      currentUser = savedAccounts[phone];
    }

    localStorage.setItem('agrilink_active_session', JSON.stringify(currentUser));
    enterLockedPortal(currentUser);
  }
}

// Locks User Strictly Into Their Registered Role Portal Only
function enterLockedPortal(user) {
  document.getElementById('authGateway').classList.add('d-none');
  document.getElementById('appWorkspace').classList.remove('d-none');

  document.getElementById('navUserName').textContent = user.name;
  document.getElementById('navUserRoleBadge').textContent = `${user.role} PORTAL`;
  document.querySelectorAll('.user-greeting-name').forEach(el => el.textContent = user.name);

  if (user.role === 'farmer') {
    const badgeEl = document.getElementById('farmerVerifiedBadge');
    const trustEl = document.getElementById('farmerTrustDisplay');
    if (user.isVerified) {
      badgeEl.innerHTML = `<i class="bi bi-patch-check-fill me-1"></i> Ghana Card Verified (${user.ghanaCard})`;
      trustEl.innerHTML = `${user.trustScore} PTS <span class="fs-6 badge bg-success">2% Fee Tier</span>`;
    } else {
      badgeEl.innerHTML = `<i class="bi bi-shield me-1"></i> Standard Account`;
      trustEl.innerHTML = `${user.trustScore} PTS <span class="fs-6 badge bg-secondary">5% Standard Fee</span>`;
    }
  }

  // Hide all portals, reveal ONLY this user's assigned portal
  document.querySelectorAll('.portal-section').forEach(sec => sec.classList.add('d-none'));
  document.getElementById(`portal-${user.role}`).classList.remove('d-none');
  previewRoleTheme(user.role);

  showToast(`Signed in as ${user.name} (${user.role.toUpperCase()}).`);
}

function logoutUser() {
  localStorage.removeItem('agrilink_active_session');
  currentUser = null;
  document.getElementById('authForm').reset();
  document.getElementById('appWorkspace').classList.add('d-none');
  document.getElementById('authGateway').classList.remove('d-none');
  showToast('Logged out safely.');
}

function renderMarketplace() {
  const query = document.getElementById('searchCrop').value.toLowerCase();
  const region = document.getElementById('filterRegion').value;
  const grid = document.getElementById('marketplaceGrid');

  const filtered = crops
    .filter(c => c.name.toLowerCase().includes(query) && (region === 'ALL' || c.region === region))
    .sort((a, b) => b.trust - a.trust);

  grid.innerHTML = filtered.map(c => `
    <div class="col-md-6 col-lg-4">
      <div class="glass-card crop-card p-4 h-100 d-flex flex-column justify-content-between">
        <div>
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill">${c.region} • ${c.hub}</span>
            <span class="badge bg-warning text-dark fw-bold"><i class="bi bi-star-fill me-1"></i>${c.trust} Trust</span>
          </div>
          <h5 class="fw-bold mb-1">${c.name}</h5>
          <p class="small text-muted mb-3">
            Seller: <strong>${c.farmer}</strong>
            ${c.verified ? '<i class="bi bi-patch-check-fill text-primary ms-1" title="Ghana Card Verified"></i>' : ''}
          </p>
          <div class="d-flex justify-content-between bg-light rounded-3 p-2 mb-3">
            <div><span class="small text-muted d-block">Available</span><strong>${c.qty} Bags</strong></div>
            <div class="text-end"><span class="small text-muted d-block">Unit Price</span><strong class="text-success">GH₵ ${c.price}</strong></div>
          </div>
        </div>
        <button class="btn btn-success w-100 fw-bold rounded-3" onclick="openCheckout(${c.id})">
          <i class="bi bi-lock-fill me-1"></i> Buy via MoMo Escrow
        </button>
      </div>
    </div>
  `).join('');
}

function openCheckout(cropId) {
  selectedCropForCheckout = crops.find(c => c.id === cropId);
  if (!selectedCropForCheckout) return;

  const deliveryFee = 120;
  const total = selectedCropForCheckout.price + deliveryFee;

  document.getElementById('checkoutDetails').innerHTML = `
    <div class="p-3 bg-light rounded-3">
      <div class="fw-bold fs-5">${selectedCropForCheckout.name} (1 Bag Order)</div>
      <div class="small text-muted mb-2">Farmer: ${selectedCropForCheckout.farmer} (${selectedCropForCheckout.hub})</div>
      <div class="d-flex justify-content-between"><span>Produce Cost:</span><strong>GH₵ ${selectedCropForCheckout.price}.00</strong></div>
      <div class="d-flex justify-content-between"><span>Platform Transport Fee:</span><strong>GH₵ ${deliveryFee}.00</strong></div>
      <hr class="my-2"/>
      <div class="d-flex justify-content-between fs-5 text-success"><span>Total Locked in Escrow:</span><strong>GH₵ ${total}.00</strong></div>
    </div>
  `;
  new bootstrap.Modal(document.getElementById('checkoutModal')).show();
}

function confirmEscrowPayment() {
  const otp = Math.floor(1000 + Math.random() * 9000);
  const total = selectedCropForCheckout.price + 120;

  activeOrders.push({
    orderId: `ORD-${Math.floor(100 + Math.random() * 900)}`,
    crop: selectedCropForCheckout.name,
    route: `${selectedCropForCheckout.hub} → ${currentUser?.region || 'Cape Coast'}`,
    amount: total,
    otp: otp,
    status: 'In Transit'
  });

  bootstrap.Modal.getInstance(document.getElementById('checkoutModal')).hide();
  renderDriverOrders();
  showToast(`Escrow Locked! Your Delivery OTP is ${otp}. Share with driver ONLY after inspection.`);
}

function renderDriverOrders() {
  const tbody = document.getElementById('activeOrdersTable');
  const totalVault = activeOrders.reduce((sum, o) => o.status !== 'Released' ? sum + o.amount : sum, 0);
  document.getElementById('escrowTotalVault').textContent = `GH₵ ${totalVault.toFixed(2)}`;

  if (activeOrders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No active escrow orders yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = activeOrders.map((o, idx) => `
    <tr>
      <td class="fw-bold">${o.orderId}</td>
      <td>${o.crop}</td>
      <td>${o.route}</td>
      <td class="fw-bold text-success">GH₵ ${o.amount}</td>
      <td><span class="badge ${o.status === 'Released' ? 'bg-success' : 'bg-warning text-dark'}">${o.status}</span></td>
      <td>
        ${o.status !== 'Released'
          ? `<div class="input-group input-group-sm" style="max-width: 190px;">
               <input type="text" id="otp-input-${idx}" class="form-control" placeholder="OTP (${o.otp})" />
               <button class="btn btn-success fw-bold" onclick="verifyDeliveryOTP(${idx})">Verify</button>
             </div>`
          : `<span class="text-success fw-bold"><i class="bi bi-check-circle-fill"></i> Paid to MoMo</span>`
        }
      </td>
    </tr>
  `).join('');
}

function verifyDeliveryOTP(idx) {
  const entered = document.getElementById(`otp-input-${idx}`).value.trim();
  if (entered === String(activeOrders[idx].otp)) {
    activeOrders[idx].status = 'Released';
    renderDriverOrders();
    showToast(`OTP Verified! MoMo Escrow released to Farmer & Driver (+5 Trust Points).`);
  } else {
    showToast(`Invalid OTP! Ask buyer for the 4-digit code.`);
  }
}

function handleFarmerWebPost(e) {
  e.preventDefault();
  const newCrop = {
    id: Date.now(),
    name: document.getElementById('cropName').value,
    farmer: currentUser?.name || "Farmer",
    region: document.getElementById('cropRegion').value,
    hub: "Local Collection Hub",
    qty: Number(document.getElementById('cropQty').value),
    price: Number(document.getElementById('cropPrice').value),
    trust: currentUser?.trustScore || 100,
    verified: currentUser?.isVerified ?? false
  };
  crops.unshift(newCrop);
  renderMarketplace();
  showToast(`Published ${newCrop.qty} bags of ${newCrop.name} to Buyer Marketplace!`);
}

function pressKey(k) { document.getElementById('ussdInput').value += k; }
function clearUSSDKey() { document.getElementById('ussdInput').value = ''; }
function dialUSSD() {
  ussdSessionText = "";
  document.getElementById('ussdInput').value = "";
  queryBackendUSSD("");
}
function sendUSSDInput() {
  const val = document.getElementById('ussdInput').value.trim();
  if (!val) return;
  ussdSessionText = ussdSessionText === "" ? val : `${ussdSessionText}*${val}`;
  document.getElementById('ussdInput').value = "";
  queryBackendUSSD(ussdSessionText);
}

async function queryBackendUSSD(textPayload) {
  const outputEl = document.getElementById('ussdOutput');
  outputEl.textContent = "Connecting to network...";

  try {
    const res = await fetch('/api/ussd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: currentUser?.phone || '+233240000001', text: textPayload })
    });
    const reply = await res.text();
    outputEl.textContent = reply.replace(/^(CON |END )/, '');

    if (textPayload.startsWith('1*1*') && textPayload.split('*').length >= 3) {
      const qty = Number(textPayload.split('*')[2]) || 10;
      crops.unshift({
        id: Date.now(),
        name: "Maize (Listed via USSD)",
        farmer: `${currentUser?.name || 'Farmer'} (USSD)`,
        region: currentUser?.region || "Central",
        hub: "Mankessim Hub",
        qty: qty,
        price: 600,
        trust: currentUser?.trustScore || 100,
        verified: currentUser?.isVerified ?? false
      });
      renderMarketplace();
    }
  } catch {
    outputEl.textContent = "Network error. Ensure Express server is running.";
  }
}

function showToast(msg) {
  document.getElementById('toastMessage').textContent = msg;
  new bootstrap.Toast(document.getElementById('liveToast')).show();
}

document.addEventListener('DOMContentLoaded', () => {
  renderMarketplace();
  renderDriverOrders();

  const activeSession = localStorage.getItem('agrilink_active_session');
  if (activeSession) {
    currentUser = JSON.parse(activeSession);
    enterLockedPortal(currentUser);
  }
});
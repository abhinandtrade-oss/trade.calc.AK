// Check Auth
const token = localStorage.getItem('trade_auth_token');
if (!token) {
    window.location.href = 'login.html';
}

document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('trade_auth_token');
    window.location.href = 'login.html';
});

// Logic
let allTrades = [];
let myChart = null;

// Modal Elements
const addChargeBtn = document.getElementById('addChargeBtn');
const chargeModal = document.getElementById('chargeModal');
const cancelChargeBtn = document.getElementById('cancelChargeBtn');
const saveChargeBtn = document.getElementById('saveChargeBtn');

if (addChargeBtn) {
    addChargeBtn.addEventListener('click', () => {
        document.getElementById('chargeDate').value = new Date().toISOString().split('T')[0];
        chargeModal.style.display = 'block';
    });
}
if (cancelChargeBtn) {
    cancelChargeBtn.addEventListener('click', () => {
        chargeModal.style.display = 'none';
    });
}
if (saveChargeBtn) {
    saveChargeBtn.addEventListener('click', saveManualCharge);
}

function saveManualCharge() {
    const date = document.getElementById('chargeDate').value;
    const amount = parseFloat(document.getElementById('chargeAmount').value);
    const desc = document.getElementById('chargeDesc').value;

    if (!amount || amount <= 0) {
        alert("Please enter a valid amount.");
        return;
    }

    saveChargeBtn.innerText = "Saving...";
    saveChargeBtn.disabled = true;

    // Construct Payload for Adjustment
    // We treating this as a 'trade' but with specific Adjustment fields
    const payload = {
        action: 'saveTrade',
        instrument: 'CHARGES',
        exchange: 'ADJ',
        buySell: '-',
        optionType: 'DEBIT',
        strikePrice: '',
        entryPrice: 0,
        exitPrice: 0,
        lots: 0,
        lotSize: 0,
        quantity: 0,
        capitalBefore: 0,
        capitalUsed: 0,
        slType: '',
        slValue: '',
        slTrigger: '',
        maxLoss: 0,
        brokerage: amount,        // Track as brokerage/charge
        grossPnl: 0,
        netPnl: -amount,          // Negative effect on Net P&L
        roi: '0%',
        status: 'Closed',
        closeReason: desc
        // Server will add Timestamps
    };

    fetch(CONFIG.WEB_APP_URL, {
        method: 'POST',
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                chargeModal.style.display = 'none';
                alert("Charge added successfully!");
                location.reload(); // Reload to show new data
            } else {
                alert("Error: " + data.message);
                saveChargeBtn.disabled = false;
                saveChargeBtn.innerText = "Save";
            }
        })
        .catch(err => {
            console.error(err);
            alert("Error saving charge.");
            saveChargeBtn.disabled = false;
            saveChargeBtn.innerText = "Save";
        });
}

function init() {
    if (!CONFIG || CONFIG.WEB_APP_URL.includes("REPLACE")) {
        alert("Config Error: URL not set");
        return;
    }

    fetch(`${CONFIG.WEB_APP_URL}?action=getTrades`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                console.log("Raw Data:", data.data);

                // Normalize Keys cause GAS headers might vary in case
                allTrades = data.data.map(t => {
                    const normalized = {};
                    Object.keys(t).forEach(k => {
                        normalized[k.toLowerCase()] = t[k];
                    });
                    return normalized;
                }).filter(t => t.date && t.date !== 'Date'); // Filter out empty rows or header echoes

                console.log("Normalized Data:", allTrades);

                // Sort by Date Descending
                // normalized key is 'createdat' or 'date'
                allTrades.sort((a, b) => new Date(b.createdat || b.date) - new Date(a.createdat || a.date));

                renderDashboard(allTrades);
                document.getElementById('loading').style.display = 'none';
                document.getElementById('content').style.display = 'block';
            } else {
                alert('Error fetching trades: ' + data.message);
            }
        })
        .catch(err => console.error(err));
}

// Filters
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        const filter = e.target.getAttribute('data-filter');
        applyFilter(filter);
    });
});

function applyFilter(filter) {
    const now = new Date();
    let filtered = allTrades;

    if (filter === 'month') {
        filtered = allTrades.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
    } else if (filter === 'week') {
        // Simple week check (last 7 days)
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        filtered = allTrades.filter(t => new Date(t.date) >= weekAgo);
    } else if (filter === 'today') {
        // Date string match "2023-12-16"
        // Note: t.Date from GAS is usually YYYY-MM-DD string
        const todayStr = now.toISOString().split('T')[0]; // Simple approx
        // Better: use date object comparison
        filtered = allTrades.filter(t => {
            // Check if t.Date string matches or if timestamp matches
            // GAS Date format depends on how we saved it. We saved as yyyy-MM-dd
            // But let's be robust
            const d = new Date(t.date);
            return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
    }

    renderDashboard(filtered);
}

function renderDashboard(trades) {
    // Calc stats
    let totalPnl = 0; // Net
    let totalGross = 0;
    let totalCharges = 0;
    let wins = 0;
    let losses = 0;
    let maxProfit = 0;
    let maxLoss = 0;

    // Sort Ascending for Chart (Oldest to Newest)
    const tradesForChart = [...trades].sort((a, b) => new Date(a.createdat || a.date) - new Date(b.createdat || b.date));
    const chartLabels = [];
    const chartData = [];
    let cumulative = 0;

    trades.forEach(t => {
        // Safe access with defaults
        const net = parseFloat(t.netpnl) || 0;
        const gross = parseFloat(t.grosspnl) || 0;
        const chg = parseFloat(t.brokerage) || 0; // 'brokerage' column stores total charges

        totalPnl += net;
        totalGross += gross;
        totalCharges += chg;

        if (net > 0) {
            wins++;
            if (net > maxProfit) maxProfit = net;
        } else if (net < 0) {
            losses++;
            if (net < maxLoss) maxLoss = net;
        }
    });

    tradesForChart.forEach(t => {
        const pnl = parseFloat(t.netpnl) || 0;
        cumulative += pnl;
        chartLabels.push(t.date + ' ' + (t.time || ''));
        chartData.push(cumulative);
    });

    const count = trades.length; // Count total trades, including 0 PnL
    const winRate = count > 0 ? ((wins / count) * 100).toFixed(1) : 0;

    // Latest Capital (from the most recent trade that has capitalbefore)
    let currentCap = 0;
    const latestTradeWithCap = trades.find(t => t.capitalbefore && parseFloat(t.capitalbefore) > 0);
    if (latestTradeWithCap) {
        currentCap = parseFloat(latestTradeWithCap.capitalbefore);
    }

    // Update DOM
    const fmt = (n) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });

    document.getElementById('totalPnl').textContent = fmt(totalPnl);
    document.getElementById('totalPnl').style.color = totalPnl >= 0 ? 'var(--success-color)' : 'var(--danger-color)';

    document.getElementById('grossPnl').textContent = fmt(totalGross);
    document.getElementById('totalCharges').textContent = fmt(totalCharges);

    document.getElementById('winRate').textContent = winRate + '%';
    document.getElementById('totalTrades').textContent = count;
    document.getElementById('maxProfit').textContent = fmt(maxProfit);
    document.getElementById('maxLoss').textContent = fmt(maxLoss);

    const capEl = document.getElementById('currentCapital');
    if (capEl) capEl.textContent = fmt(currentCap);

    // Table
    const tbody = document.querySelector('#tradesTable tbody');
    tbody.innerHTML = '';

    // Show top 20 (already sorted desc by init/filter)
    trades.slice(0, 20).forEach(t => {
        const row = document.createElement('tr');
        const pnl = parseFloat(t.netpnl) || 0;
        const capUsed = parseFloat(t.capitalused) || 0;
        const pnlClass = pnl >= 0 ? 'green' : (pnl < 0 ? 'red' : 'neutral');
        const pnlColor = pnl >= 0 ? 'var(--success-color)' : (pnl < 0 ? 'var(--danger-color)' : 'var(--text-primary)');

        row.innerHTML = `
            <td>${t.date || '-'}</td>
            <td>${t.instrument || '-'}</td>
            <td>${t.buysell || ''} ${t.optiontype || ''}</td>
            <td>${t.qty || 0}</td>
            <td>${fmt(capUsed)}</td>
            <td style="color:${pnlColor}; font-weight:600;">${fmt(pnl)}</td>
            <td>${t.status || '-'}</td>
        `;
        tbody.appendChild(row);
    });

    // Chart
    renderChart(chartLabels, chartData);
}

function renderChart(labels, data) {
    const ctx = document.getElementById('pnlChart').getContext('2d');

    if (myChart) {
        myChart.destroy();
    }

    // Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(46, 204, 113, 0.2)');
    gradient.addColorStop(1, 'rgba(46, 204, 113, 0)');

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cumulative P&L',
                data: data,
                borderColor: '#2ecc71',
                backgroundColor: gradient,
                borderWidth: 2,
                pointRadius: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            },
            scales: {
                x: {
                    display: false // Hide X axis labels for clean look
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#888'
                    }
                }
            }
        }
    });
}

init();

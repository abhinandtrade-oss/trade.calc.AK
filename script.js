document.addEventListener('DOMContentLoaded', () => {

    // Constants
    const LOT_SIZES = {
        'NIFTY': 65,
        'CRUDE': 100
    };

    // Brokerage & Tax Rates (Estimated for generic Discount Broker)
    // Ref: Zerodha/AngelOne/Upstox standard charges
    // 1. Define Default Constants
    const DEFAULT_CHARGES = {
        NIFTY: {
            brokerage: 20, // Per order
            sttPct: 0.125, // 0.125% on Sell side only (Options)
            transChargePct: 0.05, // 0.05% Exchange Txn Charge
            gstPct: 18, // 18% on (Brokerage + Txn Charge)
            sebiChargesPct: 0.0001, // ₹10 per crore
            stampDutyPct: 0.003 // 0.003% on Buy side
        },
        CRUDE: {
            brokerage: 20,
            sttPct: 0.05, // 0.05% on Sell side (Commodity Options)
            transChargePct: 0.05,
            gstPct: 18,
            sebiChargesPct: 0.0001,
            stampDutyPct: 0.003
        }
    };

    // Load from Storage or Use Default
    let CHARGES = JSON.parse(localStorage.getItem('trade_charges')) || JSON.parse(JSON.stringify(DEFAULT_CHARGES));

    // State
    let currentInstrument = 'NIFTY';

    // DOM Elements
    const instrumentTabs = document.querySelectorAll('.tab-btn');
    // 2. Select DOM Elements
    const niftyBtn = document.querySelector('.tab-btn[data-instrument="NIFTY"]');
    const crudeBtn = document.querySelector('.tab-btn[data-instrument="CRUDE"]');
    const lotSizeInput = document.getElementById('lotSize');
    const lotsInput = document.getElementById('lots');
    const entryInput = document.getElementById('entryPrice');
    const exitInput = document.getElementById('exitPrice');
    const stopLossInput = document.getElementById('stopLossPrice');
    const brokerageToggle = document.getElementById('brokerageToggle');
    const resetBtn = document.getElementById('resetBtn');

    // Outputs
    const netPnLEl = document.getElementById('netPnL');
    const grossPnLEl = document.getElementById('grossPnL');
    const totalChargesEl = document.getElementById('totalCharges');
    const totalCapitalEl = document.getElementById('totalCapital');
    const breakEvenEl = document.getElementById('breakEven');
    const roiEl = document.getElementById('roi');
    const pointsEl = document.getElementById('points');
    const riskAmountEl = document.getElementById('riskAmount');

    // Initialize
    updateLotSize();

    // Event Listeners
    instrumentTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            // UI Toggle
            instrumentTabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');

            // State Update
            currentInstrument = e.target.getAttribute('data-instrument');
            updateLotSize();
            calculate();
        });
    });

    [lotsInput, entryInput, exitInput, stopLossInput].forEach(input => {
        input.addEventListener('input', calculate);
    });

    // Radio buttons need change event
    document.querySelectorAll('input[name="position"]').forEach(r => r.addEventListener('change', calculate));

    brokerageToggle.addEventListener('change', calculate);

    resetBtn.addEventListener('click', () => {
        lotsInput.value = 1;
        entryInput.value = '';
        exitInput.value = '';
        stopLossInput.value = '';
        document.getElementById('strikePrice').value = '';
        document.getElementById('capital').value = '';
        brokerageToggle.checked = false;
        document.getElementById('buy').checked = true;
        calculate();
        document.getElementById('saveStatus').textContent = '';
    });

    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveTrade);
    }

    // Functions
    function updateLotSize() {
        lotSizeInput.value = LOT_SIZES[currentInstrument];
        calculate();
    }

    function calculate() {
        const isBuy = document.getElementById('buy').checked;
        const lots = parseFloat(lotsInput.value) || 0;
        const lotSize = parseInt(lotSizeInput.value) || 0;
        const entry = parseFloat(entryInput.value) || 0;
        const exit = parseFloat(exitInput.value) || 0;
        const stopLoss = parseFloat(stopLossInput.value) || 0;
        const showBrokerage = brokerageToggle.checked;

        // Toggle Visibility
        const resultDetails = document.getElementById('resultDetails');
        if (showBrokerage) {
            resultDetails.style.display = 'block';
        } else {
            resultDetails.style.display = 'none';
        }

        const quantity = lots * lotSize;

        // P&L Calculation
        const rawPnL = (exit - entry) * quantity * (isBuy ? 1 : -1);
        const points = (exit - entry) * (isBuy ? 1 : -1);

        // Risk Calculation (Stop Loss)
        let riskAmount = 0;
        if (stopLoss > 0 && entry > 0) {
            const riskPoints = isBuy ? (entry - stopLoss) : (stopLoss - entry);
            riskAmount = riskPoints * quantity;
        }

        // Capital Required
        const capital = entry * quantity;

        // Taxes & Brokerage
        let totalTax = 0;
        let brokerageOnly = 0;

        if (showBrokerage && quantity > 0 && entry > 0 && exit > 0) {
            const rates = CHARGES[currentInstrument];
            const turnover = (entry + exit) * quantity;

            // Brokerage: Flat 20 per order
            brokerageOnly = rates.brokerage * 2;

            const sellValue = (isBuy ? exit : entry) * quantity;
            const stt = sellValue * rates.stt;
            const txnCharge = turnover * rates.txn;
            const gst = (brokerageOnly + txnCharge) * rates.gst;
            const buyValue = (isBuy ? entry : exit) * quantity;
            const stampDuty = buyValue * rates.stamp;
            const sebiFees = turnover * rates.sebi;

            totalTax = brokerageOnly + stt + txnCharge + gst + stampDuty + sebiFees;
        }

        const netPnL = rawPnL - totalTax;

        // Break Even
        let breakEvenOffset = 0;
        if (quantity > 0) {
            breakEvenOffset = totalTax / quantity;
        }
        const breakEvenPrice = isBuy ? (entry + breakEvenOffset) : (entry - breakEvenOffset);

        // ROI
        let roi = 0;
        if (capital > 0) {
            roi = (netPnL / capital) * 100;
        }

        // --- Render ---
        const fmt = (num) => '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        grossPnLEl.textContent = fmt(rawPnL);
        totalChargesEl.textContent = fmt(totalTax);
        netPnLEl.textContent = fmt(netPnL);
        totalCapitalEl.textContent = fmt(capital);
        breakEvenEl.textContent = fmt(breakEvenPrice);
        roiEl.textContent = roi.toFixed(2) + '%';
        pointsEl.textContent = points.toFixed(2);
        riskAmountEl.textContent = fmt(riskAmount);

        // Colors
        netPnLEl.className = 'profit-loss ' + (netPnL > 0 ? 'green' : (netPnL < 0 ? 'red' : 'neutral'));

        // Store computed values for save
        window.currentCalcValues = {
            grossPnl: rawPnL,
            netPnl: netPnL,
            roi: roi.toFixed(2) + '%',
            brokerage: totalTax, // Storing total tax as brokerage column per request
            maxLoss: riskAmount,
            status: (exit > 0) ? 'Closed' : 'Open',
            closeReason: 'Manual'
        };
    }

    function saveTrade() {
        const saveStatus = document.getElementById('saveStatus');

        // Check Config
        if (!CONFIG || CONFIG.WEB_APP_URL.includes("REPLACE")) {
            saveStatus.textContent = "Error: Please configure Web App URL in config.js";
            saveStatus.style.color = "var(--danger-color)";
            return;
        }

        const entry = parseFloat(entryInput.value) || 0;
        if (entry <= 0) {
            saveStatus.textContent = "Error: Entry price required";
            saveStatus.style.color = "var(--danger-color)";
            return;
        }

        saveStatus.textContent = "Saving...";
        saveStatus.style.color = "var(--text-secondary)";
        saveBtn.disabled = true;

        const isBuy = document.getElementById('buy').checked;
        const isCe = document.getElementById('ce').checked;
        const calc = window.currentCalcValues || {};

        const payload = {
            action: 'saveTrade',
            instrument: currentInstrument,
            exchange: currentInstrument === 'NIFTY' ? 'NSE' : 'MCX',
            buySell: isBuy ? 'BUY' : 'SELL',
            optionType: isCe ? 'CE' : 'PE',
            strikePrice: document.getElementById('strikePrice').value,
            entryPrice: entry,
            exitPrice: document.getElementById('exitPrice').value || '',
            lots: lotsInput.value,
            lotSize: lotSizeInput.value,
            quantity: lotsInput.value * lotSizeInput.value,
            capitalBefore: document.getElementById('capital').value,
            capitalUsed: totalCapitalEl.textContent.replace(/[₹,]/g, ''),
            slType: 'Price',
            slValue: stopLossInput.value,
            slTrigger: stopLossInput.value,
            maxLoss: calc.maxLoss ? calc.maxLoss.toFixed(2) : 0,
            brokerage: calc.brokerage ? calc.brokerage.toFixed(2) : 0,
            grossPnl: calc.grossPnl ? calc.grossPnl.toFixed(2) : 0,
            netPnl: calc.netPnl ? calc.netPnl.toFixed(2) : 0,
            roi: calc.roi || '0%',
            status: calc.status || 'Open',
            closeReason: calc.closeReason || 'Manual'
        };

        fetch(CONFIG.WEB_APP_URL, {
            method: 'POST',
            redirect: "follow",
            headers: {
                "Content-Type": "text/plain;charset=utf-8",
            },
            body: JSON.stringify(payload)
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    saveStatus.textContent = "Trade saved successfully!";
                    saveStatus.style.color = "var(--success-color)";
                    saveBtn.disabled = false;

                    setTimeout(() => {
                        saveStatus.textContent = "";
                    }, 3000);
                } else {
                    throw new Error(data.message || 'Unknown error');
                }
            })
            .catch(err => {
                saveStatus.textContent = "Error: " + err.message;
                saveStatus.style.color = "var(--danger-color)";
                console.error(err);
                saveBtn.disabled = false;
            });
    }

    // --- Settings Modal Logic ---
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeModal = document.querySelector('.close-modal');
    const settingsForm = document.getElementById('settingsForm');
    const resetChargesBtn = document.getElementById('resetChargesBtn');
    const saveChargesBtn = document.getElementById('saveChargesBtn');
    let currentSettingsTab = 'NIFTY';

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            loadSettingsForm(currentSettingsTab);
            settingsModal.style.display = 'block';
        });

        closeModal.addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });

        window.onclick = function (event) {
            if (event.target == settingsModal) {
                settingsModal.style.display = 'none';
            }
        }
    }

    // Modal Tabs
    document.querySelectorAll('[data-settings-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('[data-settings-tab]').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentSettingsTab = e.target.getAttribute('data-settings-tab');
            loadSettingsForm(currentSettingsTab);
        });
    });

    function loadSettingsForm(instrument) {
        const c = CHARGES[instrument];
        settingsForm.innerHTML = `
            <div class="setting-row">
                <label>Brokerage (per order)</label>
                <input type="number" id="set_brokerage" value="${c.brokerage}" step="1">
            </div>
            <div class="setting-row">
                <label>STT (%)</label>
                <input type="number" id="set_stt" value="${c.sttPct}" step="0.001">
            </div>
            <div class="setting-row">
                <label>Txn Charge (%)</label>
                <input type="number" id="set_txn" value="${c.transChargePct}" step="0.001">
            </div>
            <div class="setting-row">
                <label>GST (%)</label>
                <input type="number" id="set_gst" value="${c.gstPct}" step="1">
            </div>
            <div class="setting-row">
                <label>Stamp Duty (%)</label>
                <input type="number" id="set_stamp" value="${c.stampDutyPct}" step="0.001">
            </div>
        `;
    }

    saveChargesBtn.addEventListener('click', () => {
        const newCharges = {
            brokerage: parseFloat(document.getElementById('set_brokerage').value) || 0,
            sttPct: parseFloat(document.getElementById('set_stt').value) || 0,
            transChargePct: parseFloat(document.getElementById('set_txn').value) || 0,
            gstPct: parseFloat(document.getElementById('set_gst').value) || 0,
            sebiChargesPct: CHARGES[currentSettingsTab].sebiChargesPct, // Keep default for rare ones
            stampDutyPct: parseFloat(document.getElementById('set_stamp').value) || 0
        };

        CHARGES[currentSettingsTab] = newCharges;
        localStorage.setItem('trade_charges', JSON.stringify(CHARGES));

        settingsModal.style.display = 'none';
        calculate(); // Recalc with new values
    });

    resetChargesBtn.addEventListener('click', () => {
        if (confirm("Reset all charges to default?")) {
            CHARGES = JSON.parse(JSON.stringify(DEFAULT_CHARGES));
            localStorage.removeItem('trade_charges');
            settingsModal.style.display = 'none';
            calculate();
        }
    });

});

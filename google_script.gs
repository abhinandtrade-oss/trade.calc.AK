/**
 * Google Apps Script for Options Trading Calculator
 * 
 * INSTRUCTIONS:
 * 1. Create a new Google Sheet.
 * 2. Rename the first sheet to "Trades".
 * 3. Setup header row in "Trades" sheet (Row 1):
 *    TradeID, Date, Time, Instrument, Exchange, BuySell, CallPut, Strike, Entry, Exit, Lots, LotSize, Qty, CapitalBefore, CapitalUsed, SLType, SLValue, SLTrigger, MaxLoss, Brokerage, GrossPNL, NetPNL, ROI, Status, CloseReason, CreatedAt, UpdatedAt
 * 4. Extensions > Apps Script.
 * 5. Paste this code.
 * 6. Deploy > New Deployment > Type: Web App.
 * 7. Execute as: Me.
 * 8. Who has access: Anyone.
 * 9. Copy the Web App URL.
 */

const SCRIPT_PROP = PropertiesService.getScriptProperties();

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === 'setup') {
      return handleSetup(data);
    } else if (action === 'login') {
      return handleLogin(data);
    } else if (action === 'saveTrade') {
      return handleSaveTrade(data);
    } else {
      return response({ status: 'error', message: 'Unknown action' });
    }

  } catch (err) {
    return response({ status: 'error', message: err.toString() });
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    
    if (action === 'getTrades') {
      return handleGetTrades();
    } else {
      return response({ status: 'error', message: 'Unknown action' });
    }
  } catch (err) {
    return response({ status: 'error', message: err.toString() });
  }
}

// --- Handlers ---

function handleSetup(data) {
  // Simple check to prevent overwriting if already set up (optional, but good for safety)
  // For this requested flow, "Setup Page (one time only)" implies we just set it.
  
  const username = data.username;
  const password = data.password;
  
  if (!username || !password) {
    return response({ status: 'error', message: 'Missing credentials' });
  }

  // Hash password
  const signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  const signatureStr = signature.map(function(byte) {
      // Convert to hex
      var v = (byte < 0) ? 256 + byte : byte;
      return ("0" + v.toString(16)).slice(-2);
  }).join("");

  SCRIPT_PROP.setProperty('USERNAME', username);
  SCRIPT_PROP.setProperty('PASSWORD_HASH', signatureStr);

  return response({ status: 'success', message: 'Setup completed' });
}

function handleLogin(data) {
  const inputUser = data.username;
  const inputPass = data.password;

  const storedUser = SCRIPT_PROP.getProperty('USERNAME');
  const storedHash = SCRIPT_PROP.getProperty('PASSWORD_HASH');

  if (!storedUser || !storedHash) {
    return response({ status: 'error', message: 'System not setup yet' });
  }

  if (inputUser !== storedUser) {
    return response({ status: 'error', message: 'Invalid credentials' });
  }

  // Check hash
  const signature = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, inputPass, Utilities.Charset.UTF_8);
  const signatureStr = signature.map(function(byte) {
      var v = (byte < 0) ? 256 + byte : byte;
      return ("0" + v.toString(16)).slice(-2);
  }).join("");

  if (signatureStr === storedHash) {
    return response({ status: 'success', token: 'SESSION_ACTIVE' }); // Simple token
  } else {
    return response({ status: 'error', message: 'Invalid credentials' });
  }
}

// --- Handlers ---
function getOrCreateSheet(ss) {
  let sheet = ss.getSheetByName('Trades');
  const headers = [
      "TradeID", "Date", "Time", "Instrument", "Exchange", "BuySell", "CallPut", 
      "Strike", "Entry", "Exit", "Lots", "LotSize", "Qty", 
      "CapitalBefore", "CapitalUsed", "SLType", "SLValue", "SLTrigger", 
      "MaxLoss", "Brokerage", "GrossPNL", "NetPNL", "ROI", 
      "Status", "CloseReason", "CreatedAt", "UpdatedAt"
    ];

  if (!sheet) {
    sheet = ss.insertSheet('Trades');
    sheet.appendRow(headers);
  } else {
    // Check if empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
    } else {
      // Check if first cell looks like a header
      const firstCell = sheet.getRange("A1").getValue();
      // If A1 contains "TRD-" it is likely data, not header. 
      // If A1 is empty or doesn't match "TradeID", insert headers.
      if (firstCell !== "TradeID") {
        sheet.insertRowBefore(1);
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      }
    }
  }
  return sheet;
}

function handleSaveTrade(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet(ss);

  // Generate IDs and Timestamps
  const tradeId = 'TRD-' + new Date().getTime(); 
  const now = new Date();
  const dateStr = Utilities.formatDate(now, "IST", "yyyy-MM-dd");
  const timeStr = Utilities.formatDate(now, "IST", "HH:mm:ss");
  const timestamp = now.toISOString();

  // Map data
  const rowData = [
    tradeId,
    dateStr,
    timeStr,
    data.instrument,
    data.exchange,
    data.buySell,
    data.optionType,
    data.strikePrice || '',
    data.entryPrice,
    data.exitPrice,
    data.lots,
    data.lotSize,
    data.quantity,
    data.capitalBefore || '', 
    data.capitalUsed,
    data.slType || 'Price',
    data.slValue,
    data.slTrigger || '',
    data.maxLoss,
    data.brokerage,
    data.grossPnl,
    data.netPnl,
    data.roi,
    data.status, 
    data.closeReason, 
    timestamp,
    timestamp
  ];

  sheet.appendRow(rowData);
  return response({ status: 'success', message: 'Trade saved', tradeId: tradeId });
}

function handleGetTrades() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet(ss);

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
     return response({ status: 'success', data: [] }); // Empty or just headers
  }

  const headers = data[0];
  const rows = data.slice(1);

  // Convert to array of objects
  const trades = rows.map(row => {
    let trade = {};
    headers.forEach((header, index) => {
      trade[header] = row[index];
    });
    return trade;
  });

  return response({ status: 'success', data: trades });
}

// Helper to return JSON
function response(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

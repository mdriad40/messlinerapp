/* ============================================
   Messliner — AI Control Panel Module (admin/aiControl.js)
   Integrates Gemini API for admin predictive logistics & auditing
   ============================================ */

const AIControlModule = {
  diningId: null,

  init(diningId) {
    this.diningId = diningId;
    console.log('[AIControl] Initialized for dining:', diningId);
    this.setupListeners();
  },

  setupListeners() {
    if (this._listenersAttached) return;
    this._listenersAttached = true;

    const btnForecast = document.getElementById('btnGenerateGroceryForecast');
    if (btnForecast) {
      btnForecast.addEventListener('click', () => this.generateGroceryForecast());
    }

    const btnAudit = document.getElementById('btnRunExpenseAudit');
    if (btnAudit) {
      btnAudit.addEventListener('click', () => this.runExpenseAudit());
    }

    const btnAdvice = document.getElementById('btnGetBudgetAdvice');
    if (btnAdvice) {
      btnAdvice.addEventListener('click', () => this.getBudgetOptimization());
    }

    const btnPredict = document.getElementById('btnPredictMeals');
    if (btnPredict) {
      btnPredict.addEventListener('click', () => this.predictTomorrowMeals());
    }
  },

  /**
   * Helper function to call the Gemini API
   */
  async _callGemini(prompt, systemInstruction, responseSchema = null) {
    const apiKey = (typeof GEMINI_API_KEY !== 'undefined' && GEMINI_API_KEY && GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY_HERE")
      ? GEMINI_API_KEY
      : (window.GEMINI_API_KEY || localStorage.getItem('gemini_api_key'));

    if (!apiKey) {
      throw new Error("Please configure a valid Gemini API key in firebase-config.js.");
    }

    const preferredModel = (typeof GEMINI_MODEL !== 'undefined' && GEMINI_MODEL) ? GEMINI_MODEL : 'gemini-3-flash-preview';
    const candidateModels = [
      preferredModel,
      'gemini-3-flash-preview',
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-3.8-flash'
    ].filter((m, idx, arr) => arr.indexOf(m) === idx);

    const requestBody = {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2
      }
    };

    if (systemInstruction) {
      requestBody.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    if (responseSchema) {
      requestBody.generationConfig.responseMimeType = "application/json";
      requestBody.generationConfig.responseSchema = responseSchema;
    }

    let lastError = null;

    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errText = await response.text();
          // If 503 (high demand) or 404 or 429, retry next candidate model
          if (response.status === 503 || response.status === 404 || response.status === 429) {
            console.warn(`[Gemini] Model ${model} returned ${response.status}. Trying next fallback model...`);
            lastError = new Error(`Gemini API Error: ${response.status} - ${errText}`);
            continue;
          }
          throw new Error(`Gemini API Error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        const candidate = data && data.candidates && data.candidates[0];
        if (!candidate || !candidate.content || !candidate.content.parts) {
          throw new Error("No content received from Gemini.");
        }

        const textParts = candidate.content.parts
          .filter(p => !p.thought && typeof p.text === 'string')
          .map(p => p.text);
        let resultText = (textParts.length > 0 ? textParts.join('\n') : (candidate.content.parts[0]?.text || '')).trim();

        if (responseSchema) {
          let cleanJson = resultText;
          if (cleanJson.startsWith('```')) {
            cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          }
          return JSON.parse(cleanJson);
        }

        return resultText;
      } catch (err) {
        lastError = err;
        console.warn(`[Gemini] Exception on model ${model}:`, err.message);
      }
    }

    throw lastError || new Error("Failed to get response from Gemini.");
  },

  // ─── 1. Weekly Grocery Forecasting ───────────────────────

  async generateGroceryForecast() {
    const btn = document.getElementById('btnGenerateGroceryForecast');
    const resultBox = document.getElementById('aiGroceryResult');
    const tableBody = document.getElementById('aiGroceryTableBody');
    const usersInput = document.getElementById('aiForecastUsers');

    if (!btn || !resultBox || !tableBody) return;

    const activeUsers = parseInt(usersInput.value) || 30;

    // Show loading state
    btn.disabled = true;
    const oldText = btn.innerHTML;
    btn.innerHTML = `<span class="ai-loading-dots"><span class="ai-loading-dot"></span><span class="ai-loading-dot"></span><span class="ai-loading-dot"></span></span> Calculating...`;
    resultBox.style.display = 'none';

    try {
      // 1. Fetch recent bazar transactions to understand purchasing history
      const bazarSnap = await db.ref(`dinings/${this.diningId}/bazar`).once('value');
      const bazarData = bazarSnap.val() || {};
      const recentItems = [];

      Object.values(bazarData).forEach(b => {
        if (b.items && Array.isArray(b.items)) {
          recentItems.push(...b.items);
        } else if (b.item) {
          recentItems.push(b);
        }
      });

      // Keep last 15 items for context limit efficiency
      const contextItems = recentItems.slice(-15).map(i => ({
        name: i.name || i.item || '',
        qty: i.quantity || i.qty || 0,
        unit: i.unit || 'kg',
        amount: i.amount || i.totalAmount || 0
      }));

      // 2. Build prompt
      const prompt = `
        Expected Active Users next week: ${activeUsers}
        Recent purchases logs:
        ${JSON.stringify(contextItems, null, 2)}
        
        Typical Mess Meal Plan:
        - Breakfast: Khichuri/Egg, Roti/Vegetables
        - Lunch: Rice, Chicken Curry, Lentils (Dal), Potato Vaji
        - Dinner: Rice, Fish Curry or Beef, Lentils (Dal)
        
        Calculate the precise weekly raw material requirements in standard Bangladeshi weights (kg, liter, pieces) for next week. Keep wastage minimal.
      `;

      const systemInstruction = "You are a professional university mess manager AI. Predict grocery demand in standard JSON format.";

      const schema = {
        type: "OBJECT",
        properties: {
          items: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                qty: { type: "STRING" },
                reason: { type: "STRING" }
              },
              required: ["name", "qty", "reason"]
            }
          }
        },
        required: ["items"]
      };

      // 3. Request from Gemini
      const result = await this._callGemini(prompt, systemInstruction, schema);

      // 4. Render Table
      tableBody.innerHTML = '';
      if (result.items && result.items.length > 0) {
        result.items.forEach(item => {
          tableBody.innerHTML += `
            <tr>
              <td><strong>${item.name}</strong></td>
              <td><span class="badge badge-primary">${item.qty}</span></td>
              <td><span style="font-size: var(--font-xs); color: var(--text-secondary);">${item.reason}</span></td>
            </tr>
          `;
        });
      } else {
        tableBody.innerHTML = `<tr><td colspan="3" class="text-center">No predictions returned.</td></tr>`;
      }

      resultBox.style.display = 'block';
      Notifications.toast('success', 'Forecast Ready', 'Weekly grocery demand forecasted successfully.');

    } catch (error) {
      console.error(error);
      Notifications.toast('error', 'Calculation Failed', error.message || 'Failed to generate forecast.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldText;
    }
  },

  // ─── 2. Expense Anomaly & Budget Optimizer ────────────────

  async runExpenseAudit() {
    const btn = document.getElementById('btnRunExpenseAudit');
    const resultBox = document.getElementById('aiAnomalyResult');
    const listContainer = document.getElementById('aiAnomalyList');

    if (!btn || !resultBox || !listContainer) return;

    btn.disabled = true;
    const oldText = btn.innerHTML;
    btn.innerHTML = `<span class="ai-loading-dots"><span class="ai-loading-dot"></span><span class="ai-loading-dot"></span><span class="ai-loading-dot"></span></span> Auditing...`;
    resultBox.style.display = 'none';

    try {
      // 1. Fetch expenses
      const bazarSnap = await db.ref(`dinings/${this.diningId}/bazar`).once('value');
      const bazarData = bazarSnap.val() || {};

      const transactions = Object.entries(bazarData).map(([id, b]) => ({
        id,
        date: b.date || '',
        shopper: b.shopper || b.addedBy || '',
        amount: b.amount || 0,
        items: b.items || [{ name: b.item || 'Bazar Item', qty: b.quantity || 1, unit: b.unit || 'kg', price: b.amount }]
      })).slice(-15); // context audit limit

      if (transactions.length === 0) {
        listContainer.innerHTML = `<div class="text-center p-3 text-secondary">No expenses entered yet to audit.</div>`;
        resultBox.style.display = 'block';
        return;
      }

      // 2. Prompt
      const prompt = `
        Audit the following expense entries:
        ${JSON.stringify(transactions, null, 2)}
        
        Compare with standard retail pricing in Bangladesh:
        - Miniket/Najirshail Rice: 62-75 BDT/kg
        - Soybean Oil: 160-185 BDT/liter
        - Broiler Chicken: 165-200 BDT/kg
        - Beef: 720-780 BDT/kg
        - Onion: 70-110 BDT/kg
        - Potatoes: 45-60 BDT/kg
        
        Detect pricing errors, vendor inflation, or abnormal quantity-to-meals ratios. Output anomalies.
      `;

      const systemInstruction = "You are a financial fraud audit tool. Detect anomalies (>0.75 confidence) and return them in JSON format.";

      const schema = {
        type: "OBJECT",
        properties: {
          anomalies: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                item: { type: "STRING" },
                amount: { type: "STRING" },
                reason: { type: "STRING" }
              },
              required: ["item", "amount", "reason"]
            }
          }
        },
        required: ["anomalies"]
      };

      const result = await this._callGemini(prompt, systemInstruction, schema);

      // 3. Render
      listContainer.innerHTML = '';
      if (result.anomalies && result.anomalies.length > 0) {
        result.anomalies.forEach(an => {
          listContainer.innerHTML += `
            <div class="ai-anomaly-card">
              <strong>⚠️ ${an.item} (${an.amount})</strong>: ${an.reason}
            </div>
          `;
        });
      } else {
        listContainer.innerHTML = `
          <div style="background:#ECFDF5; border-left:4px solid #10B981; padding:10px 14px; border-radius:var(--radius-md); font-size:var(--font-sm); color:#065F46;">
            <strong>✅ No Anomalies Found</strong>: All recent expenses align with market pricing norms.
          </div>
        `;
      }

      resultBox.style.display = 'block';
      Notifications.toast('success', 'Audit Complete', 'Anomalies analyzed.');

    } catch (error) {
      console.error(error);
      Notifications.toast('error', 'Audit Failed', error.message || 'Audit execution failed.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldText;
    }
  },

  async getBudgetOptimization() {
    const btn = document.getElementById('btnGetBudgetAdvice');
    const resultBox = document.getElementById('aiBudgetResult');
    const listContainer = document.getElementById('aiBudgetList');

    if (!btn || !resultBox || !listContainer) return;

    btn.disabled = true;
    const oldText = btn.innerHTML;
    btn.innerHTML = `<span class="ai-loading-dots"><span class="ai-loading-dot"></span><span class="ai-loading-dot"></span><span class="ai-loading-dot"></span></span> Analyzing...`;
    resultBox.style.display = 'none';

    try {
      // 1. Get recent transactions & total meal counts to compute averages
      const bazarSnap = await db.ref(`dinings/${this.diningId}/bazar`).once('value');
      const bazarData = bazarSnap.val() || {};
      
      const items = [];
      Object.values(bazarData).forEach(b => {
        if (b.items) items.push(...b.items);
        else if (b.item) items.push(b);
      });

      const prompt = `
        Analyze our mess ingredients list:
        ${JSON.stringify(items.slice(-20), null, 2)}
        
        Provide 3 specific cost-saving suggestions (e.g. replacing expensive beef with chicken/eggs/soy-chunks on specific days, purchasing vegetables in weekly bulks, or switching vendor timing) to lower the overall daily meal rate. Keep responses under 2 sentences each.
      `;

      const systemInstruction = "You are a professional cost optimizer. Output optimization suggestions in standard JSON array.";

      const schema = {
        type: "OBJECT",
        properties: {
          suggestions: {
            type: "ARRAY",
            items: { type: "STRING" }
          }
        },
        required: ["suggestions"]
      };

      const result = await this._callGemini(prompt, systemInstruction, schema);

      // 2. Render
      listContainer.innerHTML = '';
      if (result.suggestions && result.suggestions.length > 0) {
        result.suggestions.forEach(sug => {
          listContainer.innerHTML += `<li style="margin-bottom:8px;">${sug}</li>`;
        });
      } else {
        listContainer.innerHTML = `<li>No recommendations generated at this time. Maintain standard market rates.</li>`;
      }

      resultBox.style.display = 'block';
      Notifications.toast('success', 'Optimization Ready', 'Budget recommendations loaded.');

    } catch (error) {
      console.error(error);
      Notifications.toast('error', 'Optimization Failed', error.message || 'Failed to load suggestions.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldText;
    }
  },

  // ─── 3. Attendance Predictions ─────────────────────────

  async predictTomorrowMeals() {
    const btn = document.getElementById('btnPredictMeals');
    const resultBox = document.getElementById('aiPredictionResult');
    const tableBody = document.getElementById('aiPredictionTableBody');

    if (!btn || !resultBox || !tableBody) return;

    btn.disabled = true;
    const oldText = btn.innerHTML;
    btn.innerHTML = `<span class="ai-loading-dots"><span class="ai-loading-dot"></span><span class="ai-loading-dot"></span><span class="ai-loading-dot"></span></span> Analyzing...`;
    resultBox.style.display = 'none';

    try {
      // 1. Fetch all mess members
      const usersSnap = await db.ref(`dinings/${this.diningId}/users`).once('value');
      const users = usersSnap.val() || {};

      const membersList = Object.entries(users).map(([uid, u]) => ({
        uid,
        name: u.name || 'Member',
        role: u.role || 'member',
        classSchedule: u.profile?.classSchedule || null,
        mealHistory: u.mealHistory || null
      }));

      // 2. Check if we need mock routines (for demo purposes if user hasn't uploaded routines yet)
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const tomorrowIndex = (new Date().getDay() + 1) % 7;
      const tomorrowDay = dayNames[tomorrowIndex];

      membersList.forEach(m => {
        if (!m.classSchedule) {
          // Mock standard classes for CSE department so AI has data to predict
          if (m.name.toLowerCase().includes('riad') || m.name.toLowerCase().includes('arif')) {
            m.classSchedule = {
              [tomorrowDay]: [
                { course: "CSE-401 Compiler Lab", start: "09:00", end: "13:30" }
              ]
            };
          } else {
            m.classSchedule = {
              [tomorrowDay]: [
                { course: "General Chemistry", start: "13:00", end: "15:30" }
              ]
            };
          }
        }
      });

      const prompt = `
        Members schedules for tomorrow (${tomorrowDay}):
        ${JSON.stringify(membersList.map(m => ({ name: m.name, schedule: m.classSchedule?.[tomorrowDay] || [] })), null, 2)}
        
        Predict which meals (Breakfast: 8-9:30 AM, Lunch: 1-2:30 PM, Dinner: 8:30-10 PM) each user is likely to miss. If a class/lab overlaps with meal times, predict "OFF", otherwise predict "ON".
      `;

      const systemInstruction = "You are Messliner predictive attendance system. Detect meal skips based on time schedules and return JSON.";

      const schema = {
        type: "OBJECT",
        properties: {
          predictions: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                userName: { type: "STRING" },
                meal: { type: "STRING" },
                status: { type: "STRING" },
                confidence: { type: "STRING" },
                reasoning: { type: "STRING" }
              },
              required: ["userName", "meal", "status", "confidence", "reasoning"]
            }
          }
        },
        required: ["predictions"]
      };

      const result = await this._callGemini(prompt, systemInstruction, schema);

      // 3. Render Predictions
      tableBody.innerHTML = '';
      if (result.predictions && result.predictions.length > 0) {
        result.predictions.forEach(p => {
          const statusClass = p.status.toLowerCase().includes('skip') || p.status.toLowerCase().includes('off') ? 'danger' : 'success';
          const icon = statusClass === 'success' ? '✅ ON' : '❌ OFF';
          tableBody.innerHTML += `
            <tr>
              <td><strong>${p.userName}</strong></td>
              <td>${p.meal}</td>
              <td><span class="badge" style="background:${statusClass === 'success'?'#D1FAE5':'#FEE2E2'};color:${statusClass === 'success'?'#065F46':'#991B1B'};">${icon}</span></td>
              <td><strong>${p.confidence}</strong></td>
              <td><span style="font-size: var(--font-xs); color: var(--text-secondary);">${p.reasoning}</span></td>
            </tr>
          `;
        });
      } else {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center">No predictions generated.</td></tr>`;
      }

      resultBox.style.display = 'block';
      Notifications.toast('success', 'Analysis Done', 'Attendance predictions calculated.');

    } catch (error) {
      console.error(error);
      Notifications.toast('error', 'Prediction Failed', error.message || 'Failed to analyze attendance.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldText;
    }
  }
};

// Hook into app initialization
window.AIControlModule = AIControlModule;
if (typeof Messliner !== 'undefined') {
  Messliner.aiControl = AIControlModule;
}
console.log('[Messliner] AI Control Panel Module registered');

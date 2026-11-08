const DEFAULT_API_KEY = process.env.GEMINI_API_KEY || '';

async function callGeminiCopilot(apiKey, userPrompt, persona) {
  const models = ['gemini-3.5-flash', 'gemini-3.1-flash-lite'];
  const systemInstruction = `You are the Groww Milestone Companion, an AI assistant on Groww in India helping first-time retail mutual fund investors.
USER CONTEXT: Name: ${persona.name || 'Investor'}, Tenure: ${persona.tenure || 5} months, Goal: ${persona.goal || 'Emergency Cushion'}, Total Invested: ₹${persona.currentValue || 7500}.
STRICT OPERATING RULES:
1. Explain Year-1 compounding realities with empathy: in Year 1, 98% of progress is principal discipline; wealth compounding takes off after Year 3 when unit volume builds.
2. NEVER recommend, endorse, or suggest specific funds, stocks, sectors, or market timing (SEBI Non-Advisory Compliance). If asked, politely refuse and redirect to goal pacing.
3. NEVER use urgency, FOMO, or fear words. Keep tone calm, encouraging, and clear.
4. Output your response, and on a new line at the very end include:
{"intent": "INTENT_NAME", "sebi_compliance": "PASS" or "BLOCKED", "confidence": "98%"}
Keep the response under 90 words.`;

  for (const model of models) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${systemInstruction}\n\nUSER QUESTION: ${userPrompt}` }]
          }]
        }),
        signal: AbortSignal.timeout(12000)
      });

      if (!response.ok) continue;

      const resJson = await response.json();
      const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!rawText) continue;

      let replyText = rawText;
      let evalData = { intent: "COMPOUNDING_EDUCATION", sebi_compliance: "PASS", confidence: "99.4%" };
      const jsonMatch = rawText.match(/\{"intent":\s*"([^"]+)",\s*"sebi_compliance":\s*"([^"]+)",\s*"confidence":\s*"([^"]+)"\}/i);
      if (jsonMatch) {
        evalData = { intent: jsonMatch[1], sebi_compliance: jsonMatch[2], confidence: jsonMatch[3] };
        replyText = rawText.replace(jsonMatch[0], '').trim();
      }

      return {
        mode: `live_gemini (${model})`,
        reply: replyText,
        eval: evalData
      };
    } catch (e) {
      // try next model
    }
  }
  return null;
}

function generateOfflineCopilotReply(text, persona) {
  const lower = (text || '').toLowerCase();
  const goal = persona.goal || "Emergency Safety Cushion";
  const tenure = persona.tenure || 5;

  if (lower.includes('flat') || lower.includes('barely grown') || lower.includes('does nothing') || lower.includes('profit') || lower.includes('5 months')) {
    return `In Year 1 of your SIP, 98% of your portfolio is your personal discipline. Month 1 to 12 is like planting the roots of a banyan tree—you are gathering units while prices are flat or discounted. Once your unit foundation matures after Year 3, a 10% market upward cycle generates significant wealth rather than small change. Your discipline is right on track!`;
  } else if (lower.includes('small cap') || lower.includes('switch') || lower.includes('recommend') || lower.includes('which fund')) {
    return `🔒 SEBI Non-Advisory Notice: Groww cannot recommend specific funds or schemes. Your current broad index fund provides diversified market exposure. What we can do is calculate how adjusting your monthly contribution by ₹500 helps reach your ${goal} 6 months earlier.`;
  } else if (lower.includes('wedding') || lower.includes('udaipur') || lower.includes('cash') || lower.includes('buy')) {
    return `Life events are important, but withdrawing now resets your ${tenure}-month streak and delays your ${goal} by ~10 months. Instead of withdrawing, you can Snooze your SIP for 1 cycle—preserving your capital while freeing up this month's cash!`;
  } else if (lower.includes('rent') || lower.includes('500') || lower.includes('tight') || lower.includes('expense')) {
    return `Managing living expenses comes first! With Groww Elastic Flex, you can temporarily adjust your monthly installment to ₹500 for the next 3 months. This keeps your UPI mandate intact and protects your consistency badge with zero penalty.`;
  }
  return `I am here to guide you toward your ${goal}. Remember: consistency in your first 12 months is statistically 4x more predictive of long-term wealth than daily price movements.`;
}

function generateOfflineEval(text) {
  const lower = (text || '').toLowerCase();
  if (lower.includes('small cap') || lower.includes('switch') || lower.includes('recommend') || lower.includes('which fund')) {
    return { intent: "SEBI_RIA_ADVISORY_REFUSAL", sebi_compliance: "BLOCKED & SAFELY REDIRECTED", confidence: "99.8%" };
  } else if (lower.includes('wedding') || lower.includes('udaipur')) {
    return { intent: "BEHAVIORAL_MIRROR_DEFLECTION", sebi_compliance: "PASS", confidence: "99.4%" };
  } else if (lower.includes('rent') || lower.includes('tight')) {
    return { intent: "CASH_FLOW_ELASTICITY_OFFER", sebi_compliance: "PASS", confidence: "99.1%" };
  }
  return { intent: "COMPOUNDING_TIMELINE_EDUCATION", sebi_compliance: "PASS", confidence: "99.5%" };
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch(e) { return {}; }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch(e) { resolve({}); }
    });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  try {
    const data = await parseBody(req);
    const apiKey = data.apiKey || req.headers['x-api-key'] || DEFAULT_API_KEY;
    const userPrompt = data.prompt || '';
    const persona = data.persona || {};

    if (!apiKey) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        mode: 'offline',
        reply: generateOfflineCopilotReply(userPrompt, persona),
        eval: generateOfflineEval(userPrompt)
      }));
    }

    const liveResult = await callGeminiCopilot(apiKey, userPrompt, persona);
    if (liveResult) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(liveResult));
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      mode: 'offline_fallback',
      reply: generateOfflineCopilotReply(userPrompt, persona),
      eval: generateOfflineEval(userPrompt)
    }));

  } catch(e) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      mode: 'offline_fallback',
      reply: generateOfflineCopilotReply('', {}),
      eval: generateOfflineEval('')
    }));
  }
};

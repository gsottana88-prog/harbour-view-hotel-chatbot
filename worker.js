const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vStiwE0IkIBcBuxNERkAuZk6mHY8ezabZUKqZXGwJXW-2SI8chAkpGXpBstg_M_9bLSUdXqOAEo0ico/pub?output=csv';
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function parseCSV(csvText) {
  const rows = csvText.trim().split('\n').slice(1);
  return rows.map(row => {
    const cols = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (inQuotes) {
        if (ch === '"' && row[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          cols.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }
    cols.push(current);
    return {
      rate_id: cols[0] || '',
      item_name: cols[1] || '',
      category: cols[2] || '',
      applies_to: cols[3] || '',
      price_eur: cols[4] || '',
      unit: cols[5] || '',
      capacity: cols[6] || '',
      requires_booking: cols[7] || '',
      availability: cols[8] || '',
      slots_this_week: cols[9] || '',
      special_offer: cols[10] || '',
      description: cols[11] || '',
    };
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ reply: 'Send a POST request with a question.' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    try {
      const { question } = await request.json();
      if (!question || !question.trim()) {
        return new Response(JSON.stringify({ reply: 'Please ask a question.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }

      const csvResponse = await fetch(CSV_URL);
      const csvText = await csvResponse.text();
      const hotelData = parseCSV(csvText);

      const systemPrompt = `You are a friendly, efficient receptionist at the Harbour View Hotel, a 4-star Irish hotel.

Here is the hotel's current rate card, packages, and services. Answer the guest's question using ONLY this data.

DATA:
${JSON.stringify(hotelData, null, 2)}

RULES:
- Answer ONLY from the data above. If the answer is not in the data, say "I'm sorry, I don't have that information available."
- Quote prices with their unit (e.g., "€139 per night", "€329 per package", "€55 per person").
- Be brief and friendly, like a good receptionist.
- If a guest asks about availability, check the slots_this_week field. If it's "0", say it's fully booked for this week.
- Mention special_offer details when relevant.`;

      const aiResponse = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question },
          ],
          max_tokens: 500,
          temperature: 0.3,
        }),
      });

      const aiData = await aiResponse.json();
      const reply = aiData.choices?.[0]?.message?.content || "I'm sorry, I couldn't process that. Please try again.";

      return new Response(JSON.stringify({ reply }), {
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    } catch (error) {
      return new Response(JSON.stringify({ reply: 'Sorry, something went wrong: ' + error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
  },
};

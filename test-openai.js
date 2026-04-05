// Test OpenAI API key
require('dotenv').config();
const axios = require('axios');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

console.log('Testing OpenAI API...');
console.log('API Key:', OPENAI_API_KEY ? `${OPENAI_API_KEY.substring(0, 15)}...${OPENAI_API_KEY.substring(OPENAI_API_KEY.length - 4)}` : 'NOT SET');
console.log('');

async function testOpenAI() {
  try {
    console.log('Sending test request to OpenAI...');
    const response = await axios.post(OPENAI_API_URL, {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: 'Say "Test successful" if you can read this.' }
      ],
      max_tokens: 20
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    const reply = response.data.choices[0].message.content;
    console.log('✅ SUCCESS!');
    console.log('Response:', reply);
    console.log('Model:', response.data.model);
    console.log('');
    console.log('OpenAI API is working correctly!');

  } catch (error) {
    console.log('❌ FAILED!');
    console.log('');

    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data);

      if (error.response.status === 401) {
        console.log('\n⚠️  The API key is INVALID or EXPIRED');
        console.log('   Please check your OpenAI API key at: https://platform.openai.com/api-keys');
      } else if (error.response.status === 429) {
        console.log('\n⚠️  Rate limit exceeded or out of credits');
        console.log('   Check your OpenAI account: https://platform.openai.com/account/billing');
      } else if (error.response.status === 404) {
        console.log('\n⚠️  Model not found - check model name');
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.log('❌ Connection refused - check network/firewall');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('❌ Request timed out - check internet connection');
    } else {
      console.log('Error:', error.message);
    }
  }
}

testOpenAI();

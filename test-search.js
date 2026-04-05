// Quick test script to verify vehicle search is working

const fs = require('fs');

// Load inventory
const inventory = JSON.parse(fs.readFileSync('./inventory.json', 'utf-8'));
console.log(`Loaded ${inventory.length} vehicles from inventory\n`);

// Copy the searchInventory function from ai-backend.js
function searchInventory(query, limit = 4) {
  if (!inventory.length || !query) return inventory.slice(0, limit);

  const stopWords = new Set(['the','is','at','in','on','to','for','of','and','or','do','you','have','any','what','how','can','with','this','that','are','was','be','an','it','we','my','me','your','about','would','like','want','some','get','got','see','show','tell','anything','something','does','did']);
  const terms = query.toLowerCase().replace(/[?!.,;:'"]/g, '').split(/[\s,]+/).filter(t => t.length > 1 && !stopWords.has(t));
  console.log('Search terms after stopword removal:', terms);

  function fuzzyMatch(a, b) {
    if (a.includes(b) || b.includes(a)) return true;
    const stemA = a.replace(/e?s$/, '');
    const stemB = b.replace(/e?s$/, '');
    if (stemA.includes(stemB) || stemB.includes(stemA)) return true;
    return false;
  }

  const scored = inventory.map(v => {
    const makeLower = (v.make || '').toLowerCase();
    const modelLower = (v.model || '').toLowerCase();
    const haystack = [
      v.make, v.model, v.trim, v.color, v.bodyStyle, String(v.year), String(v.price),
      ...(v.features || [])
    ].join(' ').toLowerCase();

    let score = 0;
    let hasModelMatch = false;
    let hasMakeMatch = false;
    let hasBodyMatch = false;
    for (const term of terms) {
      if (fuzzyMatch(makeLower, term)) { score += 10; hasMakeMatch = true; }
      if (fuzzyMatch(modelLower, term)) { score += 10; hasModelMatch = true; }
      if (haystack.includes(term)) score += 3;
      const stem = term.replace(/e?s$/, '');
      if (stem !== term && haystack.includes(stem)) score += 3;
      if (term.match(/^\d+k?$/) || term === 'under' || term === 'budget') {
        const num = parseInt(term.replace('k', '000'));
        if (num > 1000 && v.price <= num * 1.15) score += 5;
      }
      const bodyLower = (v.bodyStyle || '').toLowerCase();
      if (fuzzyMatch(bodyLower, term)) { score += 8; hasBodyMatch = true; }
    }
    return { vehicle: v, score, hasModelMatch, hasMakeMatch, hasBodyMatch };
  });

  const sorted = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  console.log(`\nTotal scored vehicles: ${sorted.length}`);
  if (sorted.length > 0) {
    console.log('Top 5 results:');
    sorted.slice(0, 5).forEach((s, i) => {
      console.log(`  ${i+1}. ${s.vehicle.year} ${s.vehicle.make} ${s.vehicle.model} - Score: ${s.score} (make:${s.hasMakeMatch}, model:${s.hasModelMatch}, body:${s.hasBodyMatch})`);
    });
  }

  const bodyTypeTerms = ['suv','suvs','sedan','sedans','truck','trucks','van','vans','coupe','coupes','hatchback','hatchbacks','wagon','wagons','convertible','convertibles','crossover','crossovers'];
  const queryHasBodyType = terms.some(t => bodyTypeTerms.includes(t) || bodyTypeTerms.includes(t.replace(/e?s$/, '')));

  const modelMatches = sorted.filter(s => s.hasModelMatch);
  if (modelMatches.length > 0) {
    console.log(`\n→ Returning ${modelMatches.length} model matches`);
    return modelMatches.slice(0, limit).map(s => s.vehicle);
  }

  if (queryHasBodyType) {
    const bodyMatches = sorted.filter(s => s.hasBodyMatch);
    const makeMatches = bodyMatches.filter(s => s.hasMakeMatch);
    if (makeMatches.length > 0) {
      console.log(`\n→ Returning ${makeMatches.length} body+make matches`);
      return makeMatches.slice(0, limit).map(s => s.vehicle);
    }
    if (bodyMatches.length > 0) {
      console.log(`\n→ Returning ${bodyMatches.length} body matches`);
      return bodyMatches.slice(0, limit).map(s => s.vehicle);
    }
  }

  const makeMatches = sorted.filter(s => s.hasMakeMatch);
  if (makeMatches.length > 0) {
    console.log(`\n→ Returning ${makeMatches.length} make matches`);
    return makeMatches.slice(0, limit).map(s => s.vehicle);
  }

  console.log(`\n→ Returning ${sorted.length} general scored results`);
  return sorted.slice(0, limit).map(s => s.vehicle);
}

// Test queries
const testQueries = [
  'any fords?',
  'fords',
  'Ford',
  'show me fords',
  'nissan',
  'suvs'
];

testQueries.forEach(query => {
  console.log('\n' + '='.repeat(60));
  console.log(`TEST: "${query}"`);
  console.log('='.repeat(60));
  const results = searchInventory(query, 5);
  console.log(`\nFinal results: ${results.length} vehicles`);
  results.forEach(v => {
    console.log(`  - ${v.year} ${v.make} ${v.model} - $${v.price.toLocaleString()}`);
  });
});

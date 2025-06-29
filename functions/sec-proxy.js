// This is the final working version of the serverless function.
// It mimics user behavior by fetching the full .txt filing document,
// which is less likely to be blocked than direct XML access.

async function parseHoldingsFromXml(xmlText) {
  const holdings = [];
  const infoTableRegex = /<infoTable>([\s\S]*?)<\/infoTable>/g;
  let match;

  while ((match = infoTableRegex.exec(xmlText)) !== null) {
    const infoTableContent = match[1];
    const holding = {};

    const nameMatch = /<nameOfIssuer>([\s\S]*?)<\/nameOfIssuer>/.exec(infoTableContent);
    const valueMatch = /<value>([\s\S]*?)<\/value>/.exec(infoTableContent);
    const sshPrnamtMatch = /<sshPrnamt>([\s\S]*?)<\/sshPrnamt>/.exec(infoTableContent);
    
    if (nameMatch) holding.nameOfIssuer = nameMatch[1].trim();
    if (valueMatch) holding.value = valueMatch[1].trim();
    if (sshPrnamtMatch) holding.sshPrnamt = sshPrnamtMatch[1].trim();
    
    if (holding.nameOfIssuer && holding.value && holding.sshPrnamt) {
       holdings.push(holding);
    }
  }
  return holdings;
}

export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const cik = searchParams.get('cik');

  if (!cik) {
    return new Response(JSON.stringify({ error: 'CIK is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // Use a common browser User-Agent to appear as a regular user.
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' };
  
  try {
    // --- Step 1: Get submissions to find the latest 13F-HR filing ---
    const cikPadded = cik.padStart(10, '0');
    const submissionsUrl = `https://data.sec.gov/submissions/CIK${cikPadded}.json`;
    const submissionsResponse = await fetch(submissionsUrl, { headers });
    if (!submissionsResponse.ok) {
        throw new Error(`SEC submissions API failed: Status ${submissionsResponse.status}`);
    }
    const submissionsData = await submissionsResponse.json();

    // --- Step 2: Find the latest 13F-HR filing's accession number ---
    const recentFilings = submissionsData.filings.recent;
    let latest13F = null;
    for (let i = 0; i < recentFilings.form.length; i++) {
        if (recentFilings.form[i] === '13F-HR') {
            latest13F = { accessionNumber: recentFilings.accessionNumber[i] };
            break;
        }
    }

    if (!latest13F) {
        throw new Error("No recent 13F-HR filing found for this CIK.");
    }
    
    // --- Step 3: Fetch the full .txt filing document ---
    const accessionNumberNoDash = latest13F.accessionNumber.replace(/-/g, '');
    const filingTxtUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumberNoDash}/${latest13F.accessionNumber}.txt`;

    const holdingsResponse = await fetch(filingTxtUrl, { headers });
    if (!holdingsResponse.ok) {
        throw new Error(`Failed to fetch filing document. Status: ${holdingsResponse.status}`);
    }
    const txtData = await holdingsResponse.text();

    // --- Step 4: Parse holdings from the text file and return ---
    const holdings = await parseHoldingsFromXml(txtData);
    if (holdings.length === 0) {
        throw new Error("Could not parse holdings from the filing document.");
    }

    return new Response(JSON.stringify(holdings), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=86400' // Cache for 24 hours
      }
    });

  } catch (error) {
    console.error(`[sec-proxy] FINAL ERROR for CIK ${cik}:`, error.message);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}